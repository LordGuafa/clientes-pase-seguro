import type { Collection, Db } from "mongodb";
import type { EstadoTransferenciasRepository } from "../../../application/ports/out/reventas-repository.ts";
import type { Reventa } from "../../../domain/model/reventa.ts";

interface ReventaDoc extends Reventa {
  _id?: unknown;
}

export class ReventaRepositoryMongo implements EstadoTransferenciasRepository {
  private readonly col: Collection<ReventaDoc>;

  constructor(db: Db) {
    this.col = db.collection<ReventaDoc>("reventas");
  }

  async existeSospechosaPorBoleta(boletaCodigo: string): Promise<boolean> {
    const count = await this.col.countDocuments(
      { boletaCodigo, marcaSospechosa: true },
      { limit: 1 },
    );
    return count > 0;
  }

  async contarCompletadasPorBoleta(boletaCodigo: string): Promise<number> {
    return this.col.countDocuments({
      boletaCodigo,
      estado: "completada",
    });
  }
}
