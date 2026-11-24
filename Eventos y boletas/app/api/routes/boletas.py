from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import verificar_secreto_gateway
from app.core.database import get_db
from app.models.boleta import EstadoBoleta
from app.schemas.boleta import ActualizarPropietarioBoleta, RespuestaBoleta
from app.services.boleta_service import ServicioBoletas

router = APIRouter(
    prefix="/boletas",
    tags=["Boletas"],
    dependencies=[Depends(verificar_secreto_gateway)],
)


@router.get("", response_model=dict)
def listar_boletas(
    evento_id: str | None = Query(default=None, alias="eventoId"),
    estado: EstadoBoleta | None = None,
    propietario_id: str | None = Query(default=None, alias="propietarioId"),
    limite: int = Query(default=20, ge=1, le=100, alias="limit"),
    desplazamiento: int = Query(default=0, ge=0, alias="offset"),
    db: Session = Depends(get_db),
) -> dict:
    boletas, total = ServicioBoletas(db).listar(
        evento_id,
        estado,
        propietario_id,
        limite,
        desplazamiento,
    )
    return {
        "items": [RespuestaBoleta.model_validate(boleta) for boleta in boletas],
        "total": total,
        "limit": limite,
        "offset": desplazamiento,
    }


@router.get("/{codigo}", response_model=RespuestaBoleta)
def obtener_boleta(codigo: UUID, db: Session = Depends(get_db)) -> RespuestaBoleta:
    boleta = ServicioBoletas(db).obtener(codigo)
    return RespuestaBoleta.model_validate(boleta)


@router.patch("/{codigo}/propietario", response_model=RespuestaBoleta)
def actualizar_propietario_boleta(
    codigo: UUID,
    datos: ActualizarPropietarioBoleta,
    db: Session = Depends(get_db),
) -> RespuestaBoleta:
    boleta = ServicioBoletas(db).actualizar_propietario(codigo, datos)
    return RespuestaBoleta.model_validate(boleta)
