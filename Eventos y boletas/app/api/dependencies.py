from fastapi import Header

from app.core.config import settings
from app.domain.errors import DomainError


def verificar_secreto_gateway(
    x_gateway_secret: str | None = Header(default=None),
) -> None:
    if x_gateway_secret != settings.secreto_gateway:
        raise DomainError(
            "sin_cabecera_gateway",
            "La petición no proviene del gateway",
            status_code=401,
        )
