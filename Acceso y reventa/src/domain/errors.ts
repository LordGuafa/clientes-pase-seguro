export class DomainError extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    public readonly detalle: Record<string, unknown> = {},
  ) {
    super(mensaje);
  }
}

export class ServicioNoDisponible extends DomainError {
  constructor(servicio: string) {
    super("servicio_no_disponible", `${servicio} no respondió a tiempo`);
  }
}

export class AccesoAceptadoDuplicado extends Error {}
