import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EstadoBoleta(str, enum.Enum):
    DISPONIBLE = "disponible"
    RESERVADA = "reservada"
    VENDIDA = "vendida"
    USADA = "usada"


class Boleta(Base):
    __tablename__ = "boletas"

    codigo: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    evento_id: Mapped[str] = mapped_column(
        ForeignKey("eventos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    estado: Mapped[EstadoBoleta] = mapped_column(
        Enum(EstadoBoleta, native_enum=False, values_callable=lambda values: [v.value for v in values]),
        nullable=False,
        default=EstadoBoleta.DISPONIBLE,
    )
    propietario_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    precio_pagado: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    reservada_hasta: Mapped[datetime | None] = mapped_column(nullable=True)

    evento: Mapped["Evento"] = relationship(back_populates="boletas")
