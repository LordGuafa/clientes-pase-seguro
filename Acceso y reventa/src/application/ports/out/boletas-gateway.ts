export type EstadoBoleta = "disponible" | "reservada" | "vendida" | "usada";
export type EstadoEvento = "activo" | "cancelado" | "finalizado";

export interface BoletaRef {
  codigo: string;
  eventoId: string;
  estado: EstadoBoleta | string;
  propietarioId: string | null;
  precioPagado?: number;
}

export interface EventoRef {
  id: string;
  estado: EstadoEvento | string;
  fechaHora: string;
  precioBase: number;
  nombre?: string;
  recinto?: string;
}

export interface BoletasGateway {
  obtenerBoleta(codigo: string): Promise<BoletaRef | null>;
  obtenerEvento(id: string): Promise<EventoRef | null>;
}
