from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.evento import EstadoEvento


class CrearEvento(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    nombre: str = Field(min_length=1, max_length=200)
    recinto: str = Field(min_length=1, max_length=200)
    fecha_hora: datetime
    aforo: int = Field(gt=0)
    precio_base: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class ActualizarEvento(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=200)
    recinto: str | None = Field(default=None, min_length=1, max_length=200)
    fecha_hora: datetime | None = None
    precio_base: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    estado: EstadoEvento | None = None


class RespuestaEvento(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    nombre: str
    recinto: str
    fecha_hora: datetime
    aforo: int
    precio_base: Decimal
    estado: EstadoEvento


class DetalleEvento(RespuestaEvento):
    boletas_disponibles: int
