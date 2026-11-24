import type { Acceso } from "../../../domain/model/acceso.ts";
export interface AccesoRepository {
  guardar(acceso: Acceso): Promise<void>;
  buscarAceptadoPorBoleta(boletaCodigo: string): Promise<Acceso | null>;
  listar(filtros: {
    eventoId?: string;
    boletaCodigo?: string;
    resultado?: "aceptado" | "rechazado";
    pagina: number;
    tamano: number;
  }): Promise<{ items: Acceso[]; total: number }>;
}
