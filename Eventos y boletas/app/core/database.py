from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.url_base_datos,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False}
    if settings.url_base_datos.startswith("sqlite")
    else {},
    poolclass=StaticPool
    if make_url(settings.url_base_datos).database in ("", ":memory:", None)
    and settings.url_base_datos.startswith("sqlite")
    else None,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
