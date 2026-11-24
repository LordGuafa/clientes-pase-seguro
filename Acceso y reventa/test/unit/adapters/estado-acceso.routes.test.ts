import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ObtenerEstadoAcceso } from "../../../src/application/use-cases/obtener-estado-acceso.ts";
import { estadoAccesoRoutes } from "../../../src/adapters/in/http/routes/estado-acceso.routes.ts";
import { exigirGatewaySecret } from "../../../src/adapters/in/http/middlewares/gateway-secret.ts";
import { errorHandler } from "../../../src/adapters/in/http/middlewares/error-handler.ts";
import { InMemoryAccesoRepository } from "../../fakes/in-memory-acceso-repository.ts";
import { FakeReventaRepository } from "../../fakes/fake-reventa-repository.ts";

const BOLETA = "b7a1c2d3-1111-4222-8333-444455556666";

function buildApp(gatewaySecret?: string) {
  const accesoRepo = new InMemoryAccesoRepository();
  const reventaRepo = new FakeReventaRepository();
  const obtenerEstadoAcceso = new ObtenerEstadoAcceso({ accesoRepo, reventaRepo });

  const app = express();
  app.use(express.json());
  app.use(exigirGatewaySecret(gatewaySecret));
  app.use(estadoAccesoRoutes(obtenerEstadoAcceso));
  app.use(errorHandler);
  return { app, accesoRepo, reventaRepo };
}

describe("GET /boletas/:codigo/estado-acceso (HTTP adapter)", () => {
  it("responde 200 con valores en falso/cero cuando la boleta no tiene movimientos", async () => {
    const { app } = buildApp("gw-secret");

    const res = await request(app)
      .get(`/boletas/${BOLETA}/estado-acceso`)
      .set("X-Gateway-Secret", "gw-secret");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      boletaCodigo: BOLETA,
      ingreso: false,
      transferencias: 0,
      bloqueada: false,
    });
  });

  it("responde 400 solicitud_invalida si el código no es un UUID", async () => {
    const { app } = buildApp("gw-secret");

    const res = await request(app)
      .get("/boletas/codigo-invalido/estado-acceso")
      .set("X-Gateway-Secret", "gw-secret");

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("solicitud_invalida");
  });

  it("responde 403 no_gateway si falta o es inválida la cabecera X-Gateway-Secret", async () => {
    const { app } = buildApp("gw-secret");

    const sinHeader = await request(app).get(`/boletas/${BOLETA}/estado-acceso`);
    expect(sinHeader.status).toBe(403);
    expect(sinHeader.body.codigo).toBe("no_gateway");

    const malHeader = await request(app)
      .get(`/boletas/${BOLETA}/estado-acceso`)
      .set("X-Gateway-Secret", "otro");
    expect(malHeader.status).toBe(403);
    expect(malHeader.body.codigo).toBe("no_gateway");
  });
});
