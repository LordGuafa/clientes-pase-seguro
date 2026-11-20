import type { ReventaRepository } from "../../src/application/ports/out/reventas-repository.ts";

export class FakeReventaRepository implements ReventaRepository {
  public blocked = new Set<string>();
  public calls = { existeSospechosaPorBoleta: 0 };

  async existeSospechosaPorBoleta(boletaCodigo: string): Promise<boolean> {
    this.calls.existeSospechosaPorBoleta++;
    return this.blocked.has(boletaCodigo);
  }
}
