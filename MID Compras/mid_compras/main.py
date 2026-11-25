import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from app.api.dependencies import verificar_secreto_gateway
from app.api.error_handler import domain_error_handler
from app.core.config import settings as settings_crud
from app.core.database import Base, engine
from app.domain.errors import DomainError

from .clientes import Acceso, Ticketmaster
from .compras import confirmar, firmar, liberar_reservas_vencidas, reservar
from .config import Settings


class SolicitudReserva(BaseModel):
    eventoId: str = Field(min_length=1, max_length=100)
    compradorId: str = Field(min_length=1, max_length=100)
    cantidad: int = Field(gt=0, strict=True)


class SolicitudConfirmacion(BaseModel):
    referenciaPago: str = Field(min_length=1, max_length=200, pattern=r"\S")


class ErrorCompra(BaseModel):
    codigo: str
    mensaje: str
    detalle: dict


class EventoExterno(BaseModel):
    id: str
    nombre: str
    url: str | None
    desactualizado: bool = False


class BoletaReservada(BaseModel):
    codigo: UUID
    estado: str = "reservada"


class BoletaConfirmada(BaseModel):
    codigo: UUID
    codigoQr: str
    estado: str = "vendida"


class RespuestaReserva(BaseModel):
    id: UUID
    eventoId: str
    compradorId: str
    estado: str = "pendiente"
    boletas: list[BoletaReservada]
    total: float
    venceEn: datetime
    ticketmaster: EventoExterno | None


class RespuestaConfirmacion(BaseModel):
    id: UUID
    eventoId: str
    compradorId: str
    estado: str = "confirmada"
    referenciaPago: str
    boletas: list[BoletaConfirmada]
    total: float


async def liberar_periodicamente(detener):
    while not detener.is_set():
        try:
            await asyncio.wait_for(detener.wait(), timeout=5)
        except TimeoutError:
            try:
                await asyncio.to_thread(liberar_reservas_vencidas)
            except SQLAlchemyError:
                logging.getLogger(__name__).exception("No se pudieron liberar las reservas vencidas")


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = Settings()
    if not settings_crud.secreto_gateway:
        raise RuntimeError("Configura SECRETO_GATEWAY antes de iniciar MID Compras")
    Base.metadata.create_all(bind=engine)
    with (
        httpx.Client(base_url=config.gateway_url, timeout=config.gateway_timeout_ms / 1000) as gateway,
        httpx.Client(base_url=config.ticketmaster_base_url, timeout=2.0) as ticketmaster,
    ):
        app.state.config = config
        app.state.acceso = Acceso(gateway, config)
        app.state.ticketmaster = Ticketmaster(ticketmaster, config)
        detener = asyncio.Event()
        tarea = asyncio.create_task(liberar_periodicamente(detener))
        try:
            yield
        finally:
            detener.set()
            await tarea


app = FastAPI(title="MID Compras", version="1.0.0", lifespan=lifespan)
app.add_exception_handler(DomainError, domain_error_handler)

ERRORES = {
    400: {"model": ErrorCompra, "description": "solicitud_invalida"},
    401: {"model": ErrorCompra, "description": "sin_cabecera_gateway"},
}


@app.exception_handler(RequestValidationError)
def solicitud_invalida(request: Request, error: RequestValidationError):
    campos = [".".join(map(str, item["loc"])) for item in error.errors()]
    return domain_error_handler(request, DomainError(
        "solicitud_invalida", "Revisa los campos de la solicitud", {"campos": campos},
    ))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post(
    "/compras/reservar", status_code=201, response_model=RespuestaReserva,
    dependencies=[Depends(verificar_secreto_gateway)],
    responses={
        **ERRORES,
        404: {"model": ErrorCompra, "description": "evento_inexistente"},
        409: {"model": ErrorCompra, "description": "evento_no_disponible, limite_excedido o sin_boletas"},
        503: {"model": ErrorCompra, "description": "servicio_no_disponible"},
    },
    openapi_extra={"x-outbound-scopes": ["accesos:leer"]},
    description=(
        "Reserva inventario local y consulta el estado de acceso por el gateway. "
        "Ticketmaster Discovery enriquece los eventos vinculados con caché de 5 minutos. "
        "Si Discovery falla, se devuelve metadata cacheada o ticketmaster nulo."
    ),
)
def crear_reserva(datos: SolicitudReserva, request: Request):
    estado = request.app.state
    compra = reservar(datos.eventoId, datos.compradorId, datos.cantidad, estado.config, estado.acceso)
    return {
        "id": compra.id,
        "eventoId": compra.evento_id,
        "compradorId": compra.comprador_id,
        "boletas": [{"codigo": codigo} for codigo in compra.codigos],
        "total": compra.precio_unitario * len(compra.codigos),
        "venceEn": compra.vence_en.replace(tzinfo=timezone.utc),
        "ticketmaster": estado.ticketmaster.evento(compra.evento_id),
    }


@app.post(
    "/compras/{id}/confirmar", response_model=RespuestaConfirmacion,
    dependencies=[Depends(verificar_secreto_gateway)],
    responses={
        **ERRORES,
        404: {"model": ErrorCompra, "description": "compra_inexistente"},
        409: {"model": ErrorCompra, "description": "reserva_vencida"},
    },
    description="Registra la referencia de pago y emite QR firmados. La confirmación es idempotente.",
)
def confirmar_reserva(id: UUID, datos: SolicitudConfirmacion, request: Request):
    compra = confirmar(id, datos.referenciaPago)
    secreto = request.app.state.config.qr_secret.get_secret_value()
    return {
        "id": compra.id,
        "eventoId": compra.evento_id,
        "compradorId": compra.comprador_id,
        "referenciaPago": compra.referencia_pago,
        "boletas": [{"codigo": codigo, "codigoQr": firmar(codigo, secreto)} for codigo in compra.codigos],
        "total": compra.precio_unitario * len(compra.codigos),
    }


def openapi_compras():
    esquema = generar_openapi()
    esquema["components"]["securitySchemes"] = {
        "GatewaySecret": {"type": "apiKey", "in": "header", "name": "X-Gateway-Secret"},
    }
    for ruta, operaciones in esquema["paths"].items():
        if ruta.startswith("/compras/"):
            operacion = operaciones["post"]
            operacion["responses"].pop("422", None)
            operacion["security"] = [{"GatewaySecret": []}]
            operacion["parameters"] = [
                parametro for parametro in operacion.get("parameters", [])
                if parametro["in"] != "header"
            ]
    return esquema


generar_openapi = app.openapi
app.openapi = openapi_compras

