import { randomUUID } from "node:crypto";
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import request from "supertest";
import { expect, it } from "vitest";
import { reventasRoutes } from "../../src/adapters/in/http/routes/reventas.routes.ts";
import { ReventaRepositoryMongo } from "../../src/adapters/out/mongo/reventa.repository.mongo.ts";
import { ListarReventas } from "../../src/application/use-cases/listar-reventas.ts";

// Nunca reutilizar la URI ni la base configuradas para el servicio.
const uri = process.env.MONGO_TEST_URI;
it.skipIf(!uri)("A-HU3: consulta reventas en Mongo y devuelve por HTTP sólo las marcadas del vendedor solicitado", async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 2000 });
  const db = client.db();
  if (db.databaseName !== "pase-seguro-test") {
    throw new Error("MONGO_TEST_URI debe apuntar a pase-seguro-test");
  }
  const col = db.collection("reventas-test");
  const base = { vendedorId: randomUUID(), compradorId: "v3", precio: 90000, estado: "completada", boletaCodigo: randomUUID(), marcaSospechosa: false, registradaEn: new Date(0) };
  const ids = Array.from({ length: 5 }, () => new ObjectId());
  try {
    await col.insertMany([
      { ...base, _id: ids[0], interno: 1 }, { ...base, _id: ids[1], vendedorId: randomUUID() },
      { ...base, _id: ids[2], boletaCodigo: "b2" }, { ...base, _id: ids[3], marcaSospechosa: true },
      { ...base, _id: ids[4], vendedorId: randomUUID(), marcaSospechosa: true },
    ]);
    const repo = new ReventaRepositoryMongo(db);
    expect(await repo.listar({ vendedorId: base.vendedorId, boletaCodigo: base.boletaCodigo, marcaSospechosa: false }))
      .toEqual([{ ...base, id: ids[0].toHexString() }]);
    expect(await repo.listar({ vendedorId: base.vendedorId, marcaSospechosa: true })).toHaveLength(1);
    expect(await repo.listar({ boletaCodigo: randomUUID() })).toEqual([]);

    const app = express().use(reventasRoutes(new ListarReventas(repo)));
    await request(app).get("/reventas").query({ marcaSospechosa: true, vendedorId: base.vendedorId })
      .expect(200, [{ ...base, id: ids[3].toHexString(), marcaSospechosa: true, registradaEn: base.registradaEn.toISOString() }]);
    await request(app).get("/reventas").query({ marcaSospechosa: true, vendedorId: randomUUID() })
      .expect(200, []);
  } finally {
    try { await col.deleteMany({ _id: { $in: ids } }); } finally { await client.close(); }
  }
});
