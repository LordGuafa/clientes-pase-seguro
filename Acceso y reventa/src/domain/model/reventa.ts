export type EstadoReventa = "pendiente" | "completada" | "cancelada" | "bloqueada";

export interface Reventa {
  id: string;
  boletaCodigo: string;
  vendedorId: string;
  compradorId: string;
  precio: number;
  estado: EstadoReventa;
  marcaSospechosa: boolean;
  registradaEn: Date;
}
