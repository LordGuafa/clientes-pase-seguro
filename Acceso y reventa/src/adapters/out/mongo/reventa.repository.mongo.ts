import type { Collection, Db, Filter, ObjectId } from "mongodb";
import type { ConsultaReventas, FiltrosReventa, ReventaRepository } from "../../../application/ports/out/reventas-repository.ts";
import type { Reventa } from "../../../domain/model/reventa.ts";

type ReventaDoc = Omit<Reventa, "id"> & { id?: string; _id: string | ObjectId };

export class ReventaRepositoryMongo implements ReventaRepository, ConsultaReventas {
  private readonly col: Collection<ReventaDoc>;

  constructor(db: Db) {
    this.col = db.collection<ReventaDoc>("reventas");
  }

  async existeSospechosaPorBoleta(boletaCodigo: string): Promise<boolean> {
    return (await this.col.countDocuments({ boletaCodigo, marcaSospechosa: true })) > 0;
  }

  async listar({ vendedorId, boletaCodigo, marcaSospechosa }: FiltrosReventa): Promise<Reventa[]> {
    const filtro: Filter<ReventaDoc> = {};
    if (vendedorId !== undefined) filtro.vendedorId = vendedorId;
    if (boletaCodigo !== undefined) filtro.boletaCodigo = boletaCodigo;
    if (marcaSospechosa !== undefined) filtro.marcaSospechosa = marcaSospechosa;
    return this.col.find(filtro).sort({ registradaEn: -1, _id: 1 })
      .map(({ _id, id, vendedorId, compradorId, precio, estado, boletaCodigo, marcaSospechosa, registradaEn }) => ({
        id: id ?? _id.toString(), vendedorId, compradorId, precio, estado, boletaCodigo, marcaSospechosa, registradaEn,
      })).toArray();
  }
}
