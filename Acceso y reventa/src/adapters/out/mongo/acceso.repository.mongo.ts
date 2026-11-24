import { MongoServerError, type Collection, type Db, type Filter } from "mongodb";
import type {
  AccesoFiltros,
  AccesoRepository,
} from "../../../application/ports/out/acceso-repository.ts";
import { AccesoAceptadoDuplicado } from "../../../domain/errors.ts";
import type { Acceso } from "../../../domain/model/acceso.ts";

interface AccesoDoc extends Acceso {
  _id?: unknown;
}

export class AccesoRepositoryMongo implements AccesoRepository {
  private readonly col: Collection<AccesoDoc>;

  constructor(db: Db) {
    this.col = db.collection<AccesoDoc>("accesos");
  }

  async guardar(acceso: Acceso): Promise<void> {
    try {
      await this.col.insertOne({ ...acceso });
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) {
        throw new AccesoAceptadoDuplicado();
      }
      throw err;
    }
  }

  async buscarAceptadoPorBoleta(boletaCodigo: string): Promise<Acceso | null> {
    const doc = await this.col.findOne(
      { boletaCodigo, resultado: "aceptado" },
      { projection: { _id: 0 } },
    );
    if (!doc) return null;
    return {
      id: doc.id,
      boletaCodigo: doc.boletaCodigo,
      eventoId: doc.eventoId,
      puerta: doc.puerta,
      resultado: doc.resultado,
      motivo: doc.motivo,
      registradoEn: new Date(doc.registradoEn),
    };
  }

  async listar(filtros: AccesoFiltros): Promise<{ items: Acceso[]; total: number }> {
    const query: Filter<AccesoDoc> = {};
    if (filtros.eventoId) query.eventoId = filtros.eventoId;
    if (filtros.boletaCodigo) query.boletaCodigo = filtros.boletaCodigo;
    if (filtros.resultado) query.resultado = filtros.resultado;

    const skip = Math.max(0, (filtros.pagina - 1) * filtros.tamano);
    const [docs, total] = await Promise.all([
      this.col
        .find(query, { projection: { _id: 0 } })
        .sort({ registradoEn: -1 })
        .skip(skip)
        .limit(filtros.tamano)
        .toArray(),
      this.col.countDocuments(query),
    ]);

    return {
      items: docs.map((d) => ({
        id: d.id,
        boletaCodigo: d.boletaCodigo,
        eventoId: d.eventoId,
        puerta: d.puerta,
        resultado: d.resultado,
        motivo: d.motivo,
        registradoEn: new Date(d.registradoEn),
      })),
      total,
    };
  }
}
