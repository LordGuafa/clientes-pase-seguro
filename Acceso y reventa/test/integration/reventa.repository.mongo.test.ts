import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { expect, it } from "vitest";
import { ReventaRepositoryMongo } from "../../src/adapters/out/mongo/reventa.repository.mongo.ts";

// Nunca reutilizar la URI ni la base configuradas para el servicio.
const uri = process.env.MONGO_TEST_URI;
it.skipIf(!uri)("consulta la colección reventas con igualdad AND y sólo expone campos públicos", async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 2000 });
  const db = client.db(`test_ahu3_${randomUUID()}`);
  const col = db.collection("reventas");
  const base = { vendedorId: "v1", compradorId: "v3", precio: 90000, estado: "completada", boletaCodigo: "b1", marcaSospechosa: false, registradaEn: new Date(0) };
  const id = new ObjectId();
  try {
    await col.insertMany([
      { ...base, _id: id, interno: 1 }, { ...base, vendedorId: "v2" },
      { ...base, boletaCodigo: "b2" }, { ...base, marcaSospechosa: true },
    ]);
    const repo = new ReventaRepositoryMongo(db);
    expect(await repo.listar({})).toHaveLength(4);
    expect(await repo.listar({ vendedorId: "v1", boletaCodigo: "b1", marcaSospechosa: false }))
      .toEqual([{ ...base, id: id.toHexString() }]);
    expect(await repo.listar({ marcaSospechosa: true })).toHaveLength(1);
    expect(await repo.listar({ boletaCodigo: "ausente" })).toEqual([]);
  } finally {
    try { await col.drop(); } finally { await client.close(); }
  }
});
