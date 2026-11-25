from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.boleta import Boleta, EstadoBoleta


class RepositorioBoletas:
    def __init__(self, db: Session) -> None:
        self.db = db

    def obtener(self, codigo: UUID, *, bloquear: bool = False) -> Boleta | None:
        return self.db.get(Boleta, codigo, with_for_update=bloquear)

    def listar(
        self,
        evento_id: str | None,
        estado: EstadoBoleta | None,
        propietario_id: str | None,
        limite: int,
        desplazamiento: int,
    ) -> tuple[list[Boleta], int]:
        consulta = select(Boleta)
        if evento_id is not None:
            consulta = consulta.where(Boleta.evento_id == evento_id)
        if estado is not None:
            consulta = consulta.where(Boleta.estado == estado)
        if propietario_id is not None:
            consulta = consulta.where(Boleta.propietario_id == propietario_id)

        consulta_conteo = select(func.count()).select_from(consulta.subquery())
        total = self.db.scalar(consulta_conteo) or 0
        boletas = list(
            self.db.scalars(
                consulta.order_by(Boleta.codigo.asc())
                .limit(limite)
                .offset(desplazamiento)
            )
        )
        return boletas, total

    def agregar_varias(self, boletas: list[Boleta]) -> None:
        self.db.add_all(boletas)
        self.db.flush()

    def actualizar_propietario(
        self,
        boleta: Boleta,
        propietario_id: str,
        precio_pagado,
    ) -> Boleta:
        boleta.propietario_id = propietario_id
        boleta.precio_pagado = precio_pagado
        boleta.estado = EstadoBoleta.VENDIDA
        self.db.flush()
        return boleta
