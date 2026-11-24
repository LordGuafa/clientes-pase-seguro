import type { Collection, Db } from "mongodb";
import type { ReventaRepository } from "../../../application/ports/out/reventas-repository.ts";

export class ReventaRepositoryMongo implements ReventaRepository{
    private readonly col: Collection

    constructor(db: Db) {
        this.col = db.collection("reventas");
    }
    async existeSospechosaPorBoleta(boletaCodigo: string): Promise<boolean> {
        const n = await this.col.countDocuments({ boletaCodigo, marcaSospechosa: true })
        return n > 0
    }
}