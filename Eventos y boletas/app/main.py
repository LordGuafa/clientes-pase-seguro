from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import models
from app.api.error_handler import domain_error_handler
from app.api.routes.eventos import router as rutas_eventos
from app.api.routes.boletas import router as rutas_boletas
from app.api.routes.health import router as rutas_salud
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.domain.errors import DomainError
from app.seed import cargar_datos_iniciales


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        cargar_datos_iniciales(db)
    yield


app = FastAPI(
    title="Eventos y boletas",
    version="1.0.0",
    description="CRUD de eventos y boletas para el clúster Pase seguro",
    lifespan=lifespan,
)

app.add_exception_handler(DomainError, domain_error_handler)
app.include_router(rutas_salud)
app.include_router(rutas_eventos)
app.include_router(rutas_boletas)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=settings.puerto)
