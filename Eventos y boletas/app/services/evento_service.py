from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.domain.errors import DomainError
from app.models.boleta import Boleta
from app.models.evento import Evento, EstadoEvento
from app.repositories.boleta_repository import RepositorioBoletas
from app.repositories.evento_repository import RepositorioEventos
from app.schemas.evento import ActualizarEvento, CrearEvento


class ServicioEventos:
    def __init__(self, db: Session) -> None:
        self.eventos = RepositorioEventos(db)
        self.boletas = RepositorioBoletas(db)
        self.db = db

    def crear(self, datos: CrearEvento) -> Evento:
        fecha = datos.fecha_hora
        if fecha.tzinfo is None:
            fecha = fecha.replace(tzinfo=timezone.utc)
        if fecha <= datetime.now(timezone.utc):
            raise DomainError(
                "fecha_evento_invalida",
                "La fecha del evento no puede estar en el pasado",
                status_code=400,
            )
        if datos.aforo < 1:
            raise DomainError(
                "aforo_invalido",
                "El aforo debe ser mayor o igual a 1",
                status_code=400,
            )
        if self.eventos.obtener(datos.id) is not None:
            raise DomainError(
                "evento_ya_existe",
                "Ya existe un evento con este identificador",
                status_code=409,
            )

        evento = Evento(
            id=datos.id,
            nombre=datos.nombre,
            recinto=datos.recinto,
            fecha_hora=fecha,
            aforo=datos.aforo,
            precio_base=Decimal(str(datos.precio_base)),
            estado=EstadoEvento.ACTIVO,
        )
        self.eventos.agregar(evento)
        self.boletas.agregar_varias(
            [Boleta(evento_id=evento.id) for _ in range(evento.aforo)]
        )
        self.db.commit()
        self.db.refresh(evento)
        return evento

    def obtener(self, id_evento: str, *, bloquear: bool = False) -> Evento:
        evento = self.eventos.obtener(id_evento, bloquear=bloquear)
        if evento is None:
            raise DomainError(
                "evento_inexistente",
                "El evento no existe",
                status_code=404,
            )
        return evento

    def listar(
        self,
        estado: EstadoEvento | None,
        desde,
        hasta,
        limite: int,
        desplazamiento: int,
    ) -> tuple[list[Evento], int]:
        return self.eventos.listar(estado, desde, hasta, limite, desplazamiento)

    def actualizar(self, id_evento: str, datos: ActualizarEvento) -> Evento:
        evento = self.obtener(id_evento, bloquear=True)
        cambios = datos.model_dump(exclude_unset=True)

        if "fecha_hora" in cambios:
            fecha = cambios["fecha_hora"]
            if fecha.tzinfo is None:
                fecha = fecha.replace(tzinfo=timezone.utc)
            if fecha <= datetime.now(timezone.utc):
                raise DomainError(
                    "fecha_evento_invalida",
                    "La fecha del evento no puede estar en el pasado",
                    status_code=400,
                )
            cambios["fecha_hora"] = fecha

        for campo, valor in cambios.items():
            if campo == "precio_base":
                valor = Decimal(str(valor))
            setattr(evento, campo, valor)

        self.eventos.actualizar(evento)
        self.db.commit()
        self.db.refresh(evento)
        return evento

    def eliminar(self, id_evento: str) -> None:
        evento = self.obtener(id_evento, bloquear=True)
        if self.eventos.tiene_boletas_vendidas(id_evento):
            raise DomainError(
                "evento_con_boletas_vendidas",
                "No se puede cancelar un evento con boletas vendidas",
                status_code=409,
            )
        evento.estado = EstadoEvento.CANCELADO
        self.eventos.actualizar(evento)
        self.db.commit()
