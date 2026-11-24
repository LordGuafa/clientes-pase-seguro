import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { accesosRoutes } from "../../../src/adapters/in/http/routes/accesos.routes.ts";
import { errorHandler } from "../../../src/adapters/in/http/middlewares/error-handler.ts";
import { RegistrarAcceso } from "../../../src/application/use-cases/registrar-acceso.ts";
import { ListarAccesos } from "../../../src/application/use-cases/listar-accesos.ts";
import type { ValidarIngreso } from "../../../src/application/use-cases/validar-ingreso.ts";
import { InMemoryAccesoRepository } from "../../fakes/in-memory-acceso-repository.ts";
import { fixedClock, sequentialIds } from "../../fakes/test-helpers.ts";

const AHORA = new Date("2026-11-21T19:05:00Z");

function preparar() {
  const repo = new InMemoryAccesoRepository();
  const app = express()
    .use(express.json())
    .use(accesosRoutes({
      validarIngreso: {} as ValidarIngreso,
      registrarAcceso: new RegistrarAcceso({ accesoRepo: repo, clock: fixedClock(AHORA), generarId: sequentialIds("acc") }),
      listarAccesos: new ListarAccesos(repo),
    }))
    .use(errorHandler);
  return { app, repo };
}

const RECHAZO = { boletaCodigo: "b7a1", eventoId: "evt-1", puerta: "A", resultado: "rechazado", motivo: "qr_invalido" };

describe("POST /accesos", () => {
  it("registra un intento rechazado y responde 201 con puerta, hora y motivo", async () => {
    const { app } = preparar();
    const res = await request(app).post("/accesos").send(RECHAZO).expect(201);
    expect(res.body).toEqual({ id: "acc-1", ...RECHAZO, registradoEn: AHORA.toISOString() });
  });

  it("registra un intento aceptado sin motivo", async () => {
    const { app } = preparar();
    const res = await request(app).post("/accesos")
      .send({ boletaCodigo: "b7a1", eventoId: "evt-1", puerta: "B", resultado: "aceptado" }).expect(201);
    expect(res.body.motivo).toBeNull();
  });

  it.each([
    [{ ...RECHAZO, motivo: undefined }, "motivo"],
    [{ ...RECHAZO, motivo: "  " }, "motivo"],
    [{ ...RECHAZO, puerta: "" }, "puerta"],
    [{ ...RECHAZO, resultado: "tal_vez" }, "resultado"],
    [{ ...RECHAZO, registradoEn: "2020-01-01" }, "registradoEn"],
  ])("responde 400 con el campo inválido (%#)", async (body, campo) => {
    const { app, repo } = preparar();
    const res = await request(app).post("/accesos").send(body).expect(400);
    expect(res.body.codigo).toBe("solicitud_invalida");
    expect(res.body.detalle.errores.map((e: { campo: string }) => e.campo)).toContain(campo);
    expect(repo.items).toHaveLength(0);
  });

  it("un segundo aceptado de la misma boleta responde 409 acceso_duplicado", async () => {
    const { app } = preparar();
    const aceptado = { boletaCodigo: "b7a1", eventoId: "evt-1", puerta: "A", resultado: "aceptado" };
    await request(app).post("/accesos").send(aceptado).expect(201);
    const res = await request(app).post("/accesos").send(aceptado).expect(409);
    expect(res.body.codigo).toBe("acceso_duplicado");
  });
});

describe("GET /accesos", () => {
  it("lista con filtros y paginación por defecto", async () => {
    const { app } = preparar();
    await request(app).post("/accesos").send(RECHAZO).expect(201);
    const res = await request(app).get("/accesos?eventoId=evt-1&resultado=rechazado").expect(200);
    expect(res.body).toMatchObject({ total: 1, pagina: 1, tamano: 20 });
    expect(res.body.items[0].motivo).toBe("qr_invalido");
  });

  it.each(["pagina=0", "tamano=101", "resultado=otro", "x=1"])("rechaza %s con 400", async (query) => {
    const { app } = preparar();
    await request(app).get(`/accesos?${query}`).expect(400);
  });
});