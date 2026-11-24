from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import verificar_secreto_gateway
from app.core.database import get_db
from app.models.evento import EstadoEvento
from app.schemas.evento import (
    ActualizarEvento,
    CrearEvento,
    DetalleEvento,
    RespuestaEvento,
)
from app.services.evento_service import ServicioEventos

router = APIRouter(
    prefix="/eventos",
    tags=["Eventos"],
    dependencies=[Depends(verificar_secreto_gateway)],
)


@router.get("", response_model=dict)
def listar_eventos(
    estado: EstadoEvento | None = None,
    desde: datetime | None = None,
    hasta: datetime | None = None,
    limite: int = Query(default=20, ge=1, le=100, alias="limit"),
    desplazamiento: int = Query(default=0, ge=0, alias="offset"),
    db: Session = Depends(get_db),
) -> dict:
    eventos, total = ServicioEventos(db).listar(
        estado,
        desde,
        hasta,
        limite,
        desplazamiento,
    )
    return {
        "items": [RespuestaEvento.model_validate(evento) for evento in eventos],
        "total": total,
        "limit": limite,
        "offset": desplazamiento,
    }


@router.get("/{id_evento}", response_model=DetalleEvento)
def obtener_evento(id_evento: str, db: Session = Depends(get_db)) -> DetalleEvento:
    servicio = ServicioEventos(db)
    evento = servicio.obtener(id_evento)
    return DetalleEvento(
        **RespuestaEvento.model_validate(evento).model_dump(),
        boletas_disponibles=servicio.eventos.contar_boletas_disponibles(id_evento),
    )


@router.post("", response_model=RespuestaEvento, status_code=status.HTTP_201_CREATED)
def crear_evento(
    datos: CrearEvento,
    db: Session = Depends(get_db),
) -> RespuestaEvento:
    evento = ServicioEventos(db).crear(datos)
    return RespuestaEvento.model_validate(evento)


@router.put("/{id_evento}", response_model=RespuestaEvento)
def actualizar_evento(
    id_evento: str,
    datos: ActualizarEvento,
    db: Session = Depends(get_db),
) -> RespuestaEvento:
    evento = ServicioEventos(db).actualizar(id_evento, datos)
    return RespuestaEvento.model_validate(evento)


@router.delete("/{id_evento}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_evento(id_evento: str, db: Session = Depends(get_db)) -> None:
    ServicioEventos(db).eliminar(id_evento)
