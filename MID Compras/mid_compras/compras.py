import base64
import hmac
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Numeric, String, select
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, SessionLocal
from app.domain.errors import DomainError
from app.models.boleta import Boleta, EstadoBoleta
from app.models.evento import Evento, EstadoEvento


class Compra(Base):
    __tablename__ = "compras"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    evento_id: Mapped[str] = mapped_column(ForeignKey("eventos.id"), index=True)
    comprador_id: Mapped[str] = mapped_column(String(100))
    codigos: Mapped[list[str]] = mapped_column(JSON)
    estado: Mapped[str] = mapped_column(String(10))
    precio_unitario: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    creada_en: Mapped[datetime] = mapped_column(DateTime)
    vence_en: Mapped[datetime] = mapped_column(DateTime, index=True)
    referencia_pago: Mapped[str | None] = mapped_column(String(200))


def ahora_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def bloquear_evento(db, evento_id):
    return db.get(Evento, evento_id, with_for_update=True)


def iniciar_escritura(db):
    if db.bind.dialect.name == "sqlite":
        from sqlalchemy import text

        db.execute(text("BEGIN IMMEDIATE"))


def boletas_compra(db, compra):
    codigos = [UUID(codigo) for codigo in compra.codigos]
    boletas = db.scalars(select(Boleta).where(Boleta.codigo.in_(codigos)).with_for_update())
    por_codigo = {b.codigo: b for b in boletas}
    return [por_codigo[codigo] for codigo in codigos]


def vencer(db, compra):
    compra.estado = "vencida"
    for boleta in boletas_compra(db, compra):
        boleta.estado = EstadoBoleta.DISPONIBLE
        boleta.reservada_hasta = None


def vencer_del_evento(db, evento_id):
    compras = db.scalars(select(Compra).where(
        Compra.evento_id == evento_id, Compra.estado == "pendiente",
        Compra.vence_en <= ahora_utc(),
    ))
    for compra in compras:
        vencer(db, compra)
    db.flush()


def liberar_reservas_vencidas():
    with SessionLocal() as db:
        ids = list(db.scalars(select(Compra.evento_id).where(
            Compra.estado == "pendiente", Compra.vence_en <= ahora_utc(),
        ).distinct()))
    for evento_id in ids:
        with SessionLocal.begin() as db:
            iniciar_escritura(db)
            bloquear_evento(db, evento_id)
            vencer_del_evento(db, evento_id)


def reservar(evento_id, comprador_id, cantidad, config, acceso):
    with SessionLocal.begin() as db:
        iniciar_escritura(db)
        evento = bloquear_evento(db, evento_id)
        if evento is None:
            raise DomainError("evento_inexistente", "El evento no existe", status_code=404)
        if evento.estado != EstadoEvento.ACTIVO:
            raise DomainError("evento_no_disponible", "El evento no está activo", status_code=409)
        vencer_del_evento(db, evento_id)
        compras = db.scalars(select(Compra).where(
            Compra.evento_id == evento_id, Compra.comprador_id == comprador_id,
            Compra.estado.in_(("pendiente", "confirmada")),
        ))
        if cantidad + sum(len(c.codigos) for c in compras) > config.max_boletas:
            raise DomainError("limite_excedido", "Se excedió el límite por comprador y evento", status_code=409)

        candidatas = db.scalars(select(Boleta).where(
            Boleta.evento_id == evento_id, Boleta.estado == EstadoBoleta.DISPONIBLE,
        ).order_by(Boleta.codigo).with_for_update()).all()
        elegidas = []
        if len(candidatas) >= cantidad:
            for boleta in candidatas:
                if acceso.disponible(boleta.codigo):
                    elegidas.append(boleta)
                    if len(elegidas) == cantidad:
                        break
        if len(elegidas) != cantidad:
            raise DomainError("sin_boletas", "No hay suficientes boletas disponibles", status_code=409)

        ahora = ahora_utc()
        vence_en = ahora + timedelta(minutes=config.minutos_bloqueo)
        for boleta in elegidas:
            boleta.estado = EstadoBoleta.RESERVADA
            boleta.reservada_hasta = vence_en
        compra = Compra(
            id=str(uuid4()), evento_id=evento_id, comprador_id=comprador_id,
            codigos=[str(b.codigo) for b in elegidas], estado="pendiente",
            creada_en=ahora, vence_en=vence_en, precio_unitario=evento.precio_base,
        )
        db.add(compra)
    return compra


def confirmar(compra_id, referencia):
    with SessionLocal.begin() as db:
        iniciar_escritura(db)
        evento_id = db.scalar(select(Compra.evento_id).where(Compra.id == str(compra_id)))
        if evento_id is None:
            raise DomainError("compra_inexistente", "La compra no existe", status_code=404)
        evento = bloquear_evento(db, evento_id)
        compra = db.get(Compra, str(compra_id))
        if compra.estado == "pendiente":
            if compra.vence_en <= ahora_utc() or evento.estado != EstadoEvento.ACTIVO:
                vencer(db, compra)
            else:
                for boleta in boletas_compra(db, compra):
                    boleta.estado = EstadoBoleta.VENDIDA
                    boleta.propietario_id = compra.comprador_id
                    boleta.precio_pagado = compra.precio_unitario
                    boleta.reservada_hasta = None
                compra.estado = "confirmada"
                compra.referencia_pago = referencia
    if compra.estado == "vencida":
        raise DomainError("reserva_vencida", "La reserva ya no está vigente", status_code=409)
    return compra


def firmar(codigo, secreto):
    firma = hmac.digest(secreto.encode("utf-8"), codigo.encode("ascii"), "sha256")
    return f"{codigo}.{base64.b64encode(firma).decode('ascii')}"
