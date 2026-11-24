import enum
from datetime import datetime

from sqlalchemy import Enum, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EstadoEvento(str, enum.Enum):
    ACTIVO = "activo"
    CANCELADO = "cancelado"
    FINALIZADO = "finalizado"


class Evento(Base):
    __tablename__ = "eventos"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    recinto: Mapped[str] = mapped_column(String(200), nullable=False)
    fecha_hora: Mapped[datetime] = mapped_column(nullable=False)
    aforo: Mapped[int] = mapped_column(Integer, nullable=False)
    precio_base: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    estado: Mapped[EstadoEvento] = mapped_column(
        Enum(EstadoEvento, native_enum=False, values_callable=lambda values: [v.value for v in values]),
        nullable=False,
        default=EstadoEvento.ACTIVO,
    )

    boletas: Mapped[list["Boleta"]] = relationship(
        back_populates="evento",
        cascade="all",
    )
