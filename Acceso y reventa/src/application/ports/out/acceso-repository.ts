import type { Acceso, ResultadoAcceso } from "../../../domain/model/acceso.ts";

export interface AccesoFiltros {
  eventoId?: string;
  boletaCodigo?: string;
  resultado?: ResultadoAcceso;
  pagina: number;
  tamano: number;
}

export interface AccesoRepository {
  guardar(acceso: Acceso): Promise<void>;
  buscarAceptadoPorBoleta(boletaCodigo: string): Promise<Acceso | null>;
  listar(filtros: AccesoFiltros): Promise<{ items: Acceso[]; total: number }>;
}
