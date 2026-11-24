class DomainError(Exception):
    def __init__(
        self,
        codigo: str,
        mensaje: str,
        detalle: dict | None = None,
        status_code: int = 400,
    ) -> None:
        super().__init__(mensaje)
        self.codigo = codigo
        self.mensaje = mensaje
        self.detalle = detalle or {}
        self.status_code = status_code

