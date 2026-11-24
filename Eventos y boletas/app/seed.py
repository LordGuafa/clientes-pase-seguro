from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.boleta import Boleta
from app.models.evento import Evento, EstadoEvento


def cargar_datos_iniciales(db: Session) -> None:
    especificaciones_eventos = [
        ("evt-1", "Concierto Central", "Arena Norte", 30, 50, 80000),
        ("evt-2", "Festival Estelar", "Parque Sur", 45, 50, 95000),
        ("evt-3", "Encuentro Finalizado", "Auditorio", -30, 50, 60000),
    ]

    for id_evento, nombre, recinto, dias, aforo, precio in especificaciones_eventos:
        if db.get(Evento, id_evento) is not None:
            continue

        evento = Evento(
            id=id_evento,
            nombre=nombre,
            recinto=recinto,
            fecha_hora=datetime.now(timezone.utc) + timedelta(days=dias),
            aforo=aforo,
            precio_base=precio,
            estado=EstadoEvento.ACTIVO if dias > 0 else EstadoEvento.FINALIZADO,
        )
        db.add(evento)
        db.flush()
        db.add_all([Boleta(evento_id=id_evento) for _ in range(aforo)])

    db.commit()
