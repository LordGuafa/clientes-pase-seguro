import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../../src/adapters/in/http/middlewares/error-handler.ts";
import { DomainError } from "../../../src/domain/errors.ts";

describe("error-handler", () => {
  it.each([
    ["qr_invalido", 400],
    ["boleta_inexistente", 404],
    ["boleta_no_vendida", 409],
    ["boleta_otro_evento", 409],
    ["evento_no_disponible", 409],
    ["fuera_de_fecha", 409],
    ["boleta_ya_usada", 409],
    ["boleta_bloqueada", 403],
    ["servicio_no_disponible", 503],
  ])("mapea %s a %i", async (codigo, status) => {
    const app = express();
    app.get("/x", (_req, _res, next) => {
      next(new DomainError(codigo, "mensaje", { a: 1 }));
    });
    app.use(errorHandler);

    const res = await request(app).get("/x");

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ codigo, mensaje: "mensaje", detalle: { a: 1 } });
  });

  it("Error no controlado -> 500 sin filtrar mensaje interno", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = express();
    app.get("/x", () => {
      throw new Error("secreto interno");
    });
    app.use(errorHandler);

    const res = await request(app).get("/x");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ codigo: "error_interno", mensaje: "Error interno", detalle: {} });
    expect(JSON.stringify(res.body)).not.toContain("secreto interno");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
