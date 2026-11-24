import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { expect, it } from "vitest";
import { ReventaRepositoryMongo } from "../../src/adapters/out/mongo/reventa.repository.mongo.ts";

// Nunca reutilizar la URI ni la base configuradas para el servicio.
const uri = process.env.MONGO_TEST_URI;
it.skipIf(!uri)("consulta la colección reventas con igualdad AND y sólo expone campos públicos", async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 2000 });
  const db = client.db();
  if (db.databaseName !== "pase-seguro-test") {
    throw new Error("MONGO_TEST_URI debe apuntar a pase-seguro-test");
  }
  const col = db.collection("reventas");
  const base = { vendedorId: randomUUID(), compradorId: "v3", precio: 90000, estado: "completada", boletaCodigo: randomUUID(), marcaSospechosa: false, registradaEn: new Date(0) };
  const ids = Array.from({ length: 4 }, () => new ObjectId());
  try {
    await col.insertMany([
      { ...base, _id: ids[0], interno: 1 }, { ...base, _id: ids[1], vendedorId: "v2" },
      { ...base, _id: ids[2], boletaCodigo: "b2" }, { ...base, _id: ids[3], marcaSospechosa: true },
    ]);
    const repo = new ReventaRepositoryMongo(db);
    expect(await repo.listar({ vendedorId: base.vendedorId, boletaCodigo: base.boletaCodigo, marcaSospechosa: false }))
      .toEqual([{ ...base, id: ids[0].toHexString() }]);
    expect(await repo.listar({ vendedorId: base.vendedorId, marcaSospechosa: true })).toHaveLength(1);
    expect(await repo.listar({ boletaCodigo: randomUUID() })).toEqual([]);
  } finally {
    try { await col.deleteMany({ _id: { $in: ids } }); } finally { await client.close(); }
  }
});
