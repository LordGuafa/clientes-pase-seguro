import type { ConsultaReventas, FiltrosReventa } from "../ports/out/reventas-repository.ts";

export class ListarReventas {
  constructor(private readonly repo: ConsultaReventas) {}

  ejecutar(filtros: FiltrosReventa) {
    return this.repo.listar(filtros);
  }
}
