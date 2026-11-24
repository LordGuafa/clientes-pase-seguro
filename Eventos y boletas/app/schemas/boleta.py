from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.boleta import EstadoBoleta


class RespuestaBoleta(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    codigo: UUID
    evento_id: str
    estado: EstadoBoleta
    propietario_id: str | None
    precio_pagado: Decimal | None
    reservada_hasta: datetime | None


class ActualizarPropietarioBoleta(BaseModel):
    propietario_id: str = Field(min_length=1, max_length=100)
    precio_pagado: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
