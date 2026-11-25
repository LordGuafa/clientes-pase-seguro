import type { Reventa } from "../../../domain/model/reventa.ts";

export type FiltrosReventa = Partial<Pick<Reventa, "vendedorId" | "boletaCodigo" | "marcaSospechosa">>;

export interface ConsultaReventas {
  listar(filtros: FiltrosReventa): Promise<Reventa[]>;
}

export interface ReventaRepository {
  existeSospechosaPorBoleta(boletaCodigo: string): Promise<boolean>;
  contarCompletadasPorBoleta?(boletaCodigo: string): Promise<number>;
}

export interface EstadoTransferenciasRepository extends ReventaRepository {
  contarCompletadasPorBoleta(boletaCodigo: string): Promise<number>;
}
