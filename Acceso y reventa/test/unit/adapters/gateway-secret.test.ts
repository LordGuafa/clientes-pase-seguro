import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { exigirGatewaySecret } from "../../../src/adapters/in/http/middlewares/gateway-secret.ts";

const SECRETO = "secreto-del-gateway";

function app(secreto?: string) {
  return express()
    .use(exigirGatewaySecret(secreto))
    .get("/health", (_req, res) => { res.json({ status: "ok" }); })
    .get("/accesos", (_req, res) => { res.json({ items: [] }); });
}

describe("Cabecera secreta del gateway", () => {
  it("rechaza con 403 una llamada directa sin la cabecera", async () => {
    const res = await request(app(SECRETO)).get("/accesos").expect(403);
    expect(res.body).toEqual({
      codigo: "no_gateway",
      mensaje: "Solo se acepta tráfico proveniente del API Gateway",
      detalle: {},
    });
  });

  it.each(["otro-secreto-del-gw", "corto", ""])("rechaza un secreto incorrecto (%s)", async (valor) => {
    await request(app(SECRETO)).get("/accesos").set("X-Gateway-Secret", valor).expect(403);
  });

  it("deja pasar la llamada que trae el secreto correcto", async () => {
    await request(app(SECRETO)).get("/accesos").set("X-Gateway-Secret", SECRETO).expect(200);
  });

  it("deja /health abierto para la prueba de humo y la plataforma", async () => {
    await request(app(SECRETO)).get("/health").expect(200);
  });

  it("sin secreto configurado no bloquea (solo para desarrollo local)", async () => {
    await request(app(undefined)).get("/accesos").expect(200);
  });
});