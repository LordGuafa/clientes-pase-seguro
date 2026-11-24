import type { Collection, Db, Filter } from "mongodb";
import type { Acceso } from "../../../domain/model/acceso.ts";
import type { AccesoRepository } from "../../../application/ports/out/acceso-repository.ts";
import { AccesoAceptadoDuplicado } from "../../../domain/errors.ts";
import { MongoServerError } from "mongodb";
type AccesoDoc = Omit<Acceso, "id"> & { _id: string };

const aDoc = ({ id, ...resto }: Acceso): AccesoDoc => ({ _id: id, ...resto });
const aDominio = ({ _id, ...resto }: AccesoDoc): Acceso => ({
  id: _id,
  ...resto,
});

export class AccesoRepositoryMongo implements AccesoRepository {
  private readonly col: Collection<AccesoDoc>;

  constructor(db: Db) {
    this.col = db.collection<AccesoDoc>("accesos");
  }

  async guardar(acceso: Acceso): Promise<void> {
    try {
      await this.col.insertOne(aDoc(acceso));
    } catch (e) {
      if (e instanceof MongoServerError && e.code === 11000)
        throw new AccesoAceptadoDuplicado();
      throw e;
    }
  }

  async buscarAceptadoPorBoleta(boletaCodigo: string): Promise<Acceso | null> {
    const doc = await this.col.findOne({ boletaCodigo, resultado: "aceptado" });
    return doc ? aDominio(doc) : null;
  }

  async listar(f: Parameters<AccesoRepository["listar"]>[0]) {
    const filtro: Filter<AccesoDoc> = {};
    if (f.eventoId) filtro.eventoId = f.eventoId;
    if (f.boletaCodigo) filtro.boletaCodigo = f.boletaCodigo;
    if (f.resultado) filtro.resultado = f.resultado;
    const [docs, total] = await Promise.all([
      this.col
        .find(filtro)
        .sort({ registradoEn: -1 })
        .skip((f.pagina - 1) * f.tamano)
        .limit(f.tamano)
        .toArray(),
      this.col.countDocuments(filtro),
    ]);
    return { items: docs.map(aDominio), total };
  }
}
