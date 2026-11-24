import os

os.environ["URL_BASE_DATOS"] = "sqlite+pysqlite:///:memory:"
os.environ["SECRETO_GATEWAY"] = "test-gateway-secret"

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import Base, SessionLocal, engine, get_db
from app.main import app


@pytest.fixture
def sesion_bd() -> Generator[Session, None, None]:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as sesion:
        yield sesion
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def cliente_prueba(sesion_bd: Session) -> Generator[TestClient, None, None]:
    def sobrescribir_bd() -> Generator[Session, None, None]:
        yield sesion_bd

    app.dependency_overrides[get_db] = sobrescribir_bd
    with TestClient(app) as cliente:
        yield cliente
    app.dependency_overrides.clear()


@pytest.fixture
def cabeceras_gateway() -> dict[str, str]:
    return {"x-gateway-secret": "test-gateway-secret"}
