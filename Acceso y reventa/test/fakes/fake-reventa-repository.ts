import type { EstadoTransferenciasRepository } from "../../src/application/ports/out/reventas-repository.ts";
import type { Reventa } from "../../src/domain/model/reventa.ts";

export class FakeReventaRepository implements EstadoTransferenciasRepository {
  public blocked = new Set<string>();
  public items: Reventa[] = [];
  public calls = { existeSospechosaPorBoleta: 0, contarCompletadasPorBoleta: 0 };

  async existeSospechosaPorBoleta(boletaCodigo: string): Promise<boolean> {
    this.calls.existeSospechosaPorBoleta++;
    if (this.blocked.has(boletaCodigo)) return true;
    return this.items.some(
      (r) => r.boletaCodigo === boletaCodigo && r.marcaSospechosa,
    );
  }

  async contarCompletadasPorBoleta(boletaCodigo: string): Promise<number> {
    this.calls.contarCompletadasPorBoleta++;
    return this.items.filter(
      (r) => r.boletaCodigo === boletaCodigo && r.estado === "completada",
    ).length;
  }
}
