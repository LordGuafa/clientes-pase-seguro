import { expect, it, vi } from "vitest";
import { AccesosGatewayHttp } from "../../../src/adapters/out/gateway-clients/accesos.gateway.http.ts";
import { GatewayHttpClient } from "../../../src/adapters/out/gateway-clients/http-client.ts";
import { TokenProvider } from "../../../src/adapters/out/gateway-clients/token-provider.ts";
import { AccesoAceptadoDuplicado, ServicioNoDisponible } from "../../../src/domain/errors.ts";

const intento = { boletaCodigo: "b1", eventoId: "e1", puerta: "A", resultado: "aceptado" as const, motivo: null };

function cliente(fetch: typeof globalThis.fetch) {
  const tokenProvider = new TokenProvider({ baseUrl: "http://gateway.test", tokenPath: "/token", clientId: "test", clientSecret: "test", timeoutMs: 100 });
  vi.spyOn(tokenProvider, "obtener").mockResolvedValue("token");
  return new AccesosGatewayHttp(new GatewayHttpClient({ baseUrl: "http://gateway.test", tokenProvider, fetch, timeoutMs: 100, maxRetries: 2 }));
}

it("no repite una escritura no confirmada aunque GET permita reintentos", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("conexión perdida"));
  await expect(cliente(fetch).registrar(intento)).rejects.toBeInstanceOf(ServicioNoDisponible);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("traduce el conflicto de la inserción concurrente del CRUD", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ codigo: "acceso_duplicado" }, { status: 409 }));
  await expect(cliente(fetch).registrar(intento)).rejects.toBeInstanceOf(AccesoAceptadoDuplicado);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("no toma un 404 ni un resumen ilegible como boleta sin historial", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(Response.json({}));
  const api = cliente(fetch);
  await expect(api.obtenerEstado("b1")).rejects.toBeInstanceOf(ServicioNoDisponible);
  await expect(api.obtenerEstado("b1")).rejects.toBeInstanceOf(ServicioNoDisponible);
});
