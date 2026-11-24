import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { reventasRoutes } from "../../../src/adapters/in/http/routes/reventas.routes.ts";
import { ListarReventas } from "../../../src/application/use-cases/listar-reventas.ts";
import type { ConsultaReventas } from "../../../src/application/ports/out/reventas-repository.ts";

function preparar() {
  const listar = vi.fn<ConsultaReventas["listar"]>().mockResolvedValue([]);
  const app = express().use(reventasRoutes(new ListarReventas({ listar })));
  return { app, listar };
}

it("sin filtros consulta todo y serializa la lista sin envoltorio", async () => {
  const { app, listar } = preparar();
  const reventa = { id: "r1", boletaCodigo: "b1", vendedorId: "v1", compradorId: "v2", precio: 90000, estado: "bloqueada", marcaSospechosa: true, registradaEn: new Date(0) };
  listar.mockResolvedValue([reventa]);
  await request(app).get("/reventas").expect(200, [{ ...reventa, registradaEn: reventa.registradaEn.toISOString() }]);
  expect(listar).toHaveBeenCalledWith({});
});

it.each([true, false])("combina los tres filtros y conserva el booleano %s", async marca => {
  const { app, listar } = preparar();
  await request(app).get(`/reventas?vendedorId=%20v1%20&boletaCodigo=b1&marcaSospechosa=${marca}`).expect(200, []);
  expect(listar).toHaveBeenCalledWith({ vendedorId: "v1", boletaCodigo: "b1", marcaSospechosa: marca });
});

it.each([
  ["marcaSospechosa=True", "marcaSospechosa"], ["marcaSospechosa=0", "marcaSospechosa"],
  ["marcaSospechosa=", "marcaSospechosa"], ["vendedorId=v&vendedorId=v", "vendedorId"],
  ["boletaCodigo=%20", "boletaCodigo"], ["otro=x", "otro"],
])("rechaza %s antes de consultar", async (query, campo) => {
  const { app, listar } = preparar();
  const res = await request(app).get(`/reventas?${query}`).expect(400);
  expect(res.body).toEqual({ codigo: "solicitud_invalida", mensaje: "Los filtros de la petición no son válidos",
    detalle: { errores: [{ campo, mensaje: expect.any(String) }] } });
  expect(listar).not.toHaveBeenCalled();
});
