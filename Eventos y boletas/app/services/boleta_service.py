from uuid import UUID

from sqlalchemy.orm import Session

from app.domain.errors import DomainError
from app.models.boleta import Boleta, EstadoBoleta
from app.repositories.boleta_repository import RepositorioBoletas
from app.schemas.boleta import ActualizarPropietarioBoleta


class ServicioBoletas:
    def __init__(self, db: Session) -> None:
        self.boletas = RepositorioBoletas(db)
        self.db = db

    def obtener(self, codigo: UUID) -> Boleta:
        boleta = self.boletas.obtener(codigo)
        if boleta is None:
            raise DomainError(
                "boleta_inexistente",
                "La boleta no existe",
                status_code=404,
            )
        return boleta

    def listar(
        self,
        evento_id: str | None,
        estado: EstadoBoleta | None,
        propietario_id: str | None,
        limite: int,
        desplazamiento: int,
    ) -> tuple[list[Boleta], int]:
        return self.boletas.listar(
            evento_id,
            estado,
            propietario_id,
            limite,
            desplazamiento,
        )

    def actualizar_propietario(
        self,
        codigo: UUID,
        datos: ActualizarPropietarioBoleta,
    ) -> Boleta:
        boleta = self.obtener(codigo)
        if boleta.estado == EstadoBoleta.USADA:
            raise DomainError(
                "boleta_ya_usada",
                "No se puede cambiar el propietario de una boleta usada",
                status_code=409,
            )
        boleta = self.boletas.actualizar_propietario(
            boleta,
            datos.propietario_id,
            datos.precio_pagado,
        )
        self.db.commit()
        self.db.refresh(boleta)
        return boleta
