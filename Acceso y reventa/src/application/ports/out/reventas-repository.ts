import type { Reventa } from "../../../domain/model/reventa.ts";

export type FiltrosReventa = Partial<Pick<Reventa, "vendedorId" | "boletaCodigo" | "marcaSospechosa">>;

export interface ConsultaReventas {
  listar(filtros: FiltrosReventa): Promise<Reventa[]>;
}

export interface ReventaRepository {
  existeSospechosaPorBoleta(boletaCodigo: string): Promise<boolean>;
}
