export interface BoletaRef {
  codigo: string;
  eventoId: string;
  estado: "disponible" | "reservada" | "vendida" | "usada";
  propietarioId: string | null;
}

export interface EventoRef {
  id: string;
  estado: "activo" | "cancelado" | "finalizado";
  fechaHora: string; //ISO
  precioBase: number;
}

export interface BoletasGateway {
  obtenerBoleta(codigo: string): Promise<BoletaRef | null>;
  obtenerEvento(id: string): Promise<EventoRef | null>;
}
