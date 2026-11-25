from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.boleta import Boleta, EstadoBoleta
from app.models.evento import Evento, EstadoEvento


class RepositorioEventos:
    def __init__(self, db: Session) -> None:
        self.db = db

    def obtener(self, id_evento: str, *, bloquear: bool = False) -> Evento | None:
        return self.db.get(Evento, id_evento, with_for_update=bloquear)

    def listar(
        self,
        estado: EstadoEvento | None,
        desde,
        hasta,
        limite: int,
        desplazamiento: int,
    ) -> tuple[list[Evento], int]:
        consulta = select(Evento)
        if estado is not None:
            consulta = consulta.where(Evento.estado == estado)
        if desde is not None:
            consulta = consulta.where(Evento.fecha_hora >= desde)
        if hasta is not None:
            consulta = consulta.where(Evento.fecha_hora <= hasta)

        consulta_conteo = select(func.count()).select_from(consulta.subquery())
        total = self.db.scalar(consulta_conteo) or 0
        eventos = list(
            self.db.scalars(
                consulta.order_by(Evento.fecha_hora.asc())
                .limit(limite)
                .offset(desplazamiento)
            )
        )
        return eventos, total

    def agregar(self, evento: Evento) -> Evento:
        self.db.add(evento)
        self.db.flush()
        return evento

    def actualizar(self, evento: Evento) -> Evento:
        self.db.flush()
        return evento

    def eliminar(self, evento: Evento) -> None:
        self.db.delete(evento)

    def contar_boletas_disponibles(self, id_evento: str) -> int:
        consulta = select(func.count()).select_from(Boleta).where(
            Boleta.evento_id == id_evento,
            Boleta.estado == EstadoBoleta.DISPONIBLE,
        )
        return self.db.scalar(consulta) or 0

    def tiene_boletas_vendidas(self, id_evento: str) -> bool:
        consulta = select(func.count()).select_from(Boleta).where(
            Boleta.evento_id == id_evento,
            Boleta.estado.in_([EstadoBoleta.VENDIDA, EstadoBoleta.USADA]),
        )
        return (self.db.scalar(consulta) or 0) > 0
