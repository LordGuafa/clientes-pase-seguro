from fastapi import Request
from fastapi.responses import JSONResponse

from app.domain.errors import DomainError


def domain_error_handler(_request: Request, error: DomainError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={
            "codigo": error.codigo,
            "mensaje": error.mensaje,
            "detalle": error.detalle,
        },
    )
