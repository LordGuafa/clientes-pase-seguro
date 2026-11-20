import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenProvider } from "../../src/adapters/out/gateway-clients/token-provider.ts";
import { GatewayHttpClient } from "../../src/adapters/out/gateway-clients/http-client.ts";
import { BoletasGatewayHttp } from "../../src/adapters/out/gateway-clients/boletas.gateway.http.ts";
import { ServicioNoDisponible } from "../../src/domain/errors.ts";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, counts: Record<string, number>) => void | Promise<void>;

async function startServer(handler: Handler) {
  const counts: Record<string, number> = {};
  const server = http.createServer(async (req, res) => {
    const key = `${req.method} ${req.url}`;
    counts[key] = (counts[key] ?? 0) + 1;
    counts.__total = (counts.__total ?? 0) + 1;
    await handler(req, res, counts);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    baseUrl,
    counts,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

const sleepNoop = async () => {};

function makeClient(baseUrl: string, opts?: { timeoutMs?: number; maxRetries?: number; clientSecret?: string }) {
  const tokenProvider = new TokenProvider({
    baseUrl,
    tokenPath: "/token",
    clientId: "cid",
    clientSecret: opts?.clientSecret ?? "csecret",
    timeoutMs: opts?.timeoutMs ?? 1000,
  });
  const httpClient = new GatewayHttpClient({
    baseUrl,
    tokenProvider,
    timeoutMs: opts?.timeoutMs ?? 1000,
    maxRetries: opts?.maxRetries ?? 2,
    sleep: sleepNoop,
  });
  return new BoletasGatewayHttp(httpClient);
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const boletaOk = { codigo: "b1", eventoId: "e1", estado: "vendida", propietarioId: "u1" };
const eventoOk = { id: "e1", estado: "activo", fechaHora: "2026-11-19T18:00:00Z", precioBase: 1000 };

const servers: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (servers.length) {
    await servers.pop()!.close();
  }
});

describe("gateway-client integration", () => {
  it("1. Camino feliz: pide token una vez, GET /boletas con Authorization, devuelve BoletaRef", async () => {
    const s = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 200, { access_token: "tok1", expires_in: 3600 });
      if (req.method === "GET" && req.url === "/boletas/b1") {
        expect(req.headers.authorization).toBe("Bearer tok1");
        return json(res, 200, boletaOk);
      }
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl);
    const r = await gw.obtenerBoleta("b1");
    expect(r).toEqual(boletaOk);
    expect(s.counts["POST /token"]).toBe(1);
    expect(s.counts["GET /boletas/b1"]).toBe(1);
  });

  it("2. Caché de token: dos llamadas seguidas hacen UNA sola petición a /token", async () => {
    const s = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 200, { access_token: "tok1", expires_in: 3600 });
      if (req.method === "GET" && req.url === "/boletas/b1") return json(res, 200, boletaOk);
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl);
    await gw.obtenerBoleta("b1");
    await gw.obtenerBoleta("b1");
    expect(s.counts["POST /token"]).toBe(1);
  });

  it("3. Single-flight: 5 llamadas simultáneas -> UNA petición a /token", async () => {
    const s = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 200, { access_token: "tok1", expires_in: 3600 });
      if (req.method === "GET" && req.url === "/boletas/b1") return json(res, 200, boletaOk);
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl);
    await Promise.all(Array.from({ length: 5 }, () => gw.obtenerBoleta("b1")));
    expect(s.counts["POST /token"]).toBe(1);
  });

  it("4. 401 una vez y luego 200: invalida token, pide nuevo, reintenta UNA vez", async () => {
    const s = await startServer((req, res, counts) => {
      if (req.method === "POST" && req.url === "/token") {
        const n = counts["POST /token"] ?? 0;
        return json(res, 200, { access_token: n === 1 ? "tok1" : "tok2", expires_in: 3600 });
      }
      if (req.method === "GET" && req.url === "/boletas/b1") {
        if ((counts["GET /boletas/b1"] ?? 0) === 1) return json(res, 401, {});
        expect(req.headers.authorization).toBe("Bearer tok2");
        return json(res, 200, boletaOk);
      }
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl);
    const r = await gw.obtenerBoleta("b1");
    expect(r).toEqual(boletaOk);
    expect(s.counts["POST /token"]).toBe(2);
    expect(s.counts["GET /boletas/b1"]).toBe(2);
  });

  it("5. 401 persistente: 2 peticiones a la ruta y ServicioNoDisponible", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 200, { access_token: "tok1", expires_in: 3600 });
      if (req.method === "GET" && req.url === "/boletas/b1") return json(res, 401, {});
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl);
    await expect(gw.obtenerBoleta("b1")).rejects.toBeInstanceOf(ServicioNoDisponible);
    expect(s.counts["GET /boletas/b1"]).toBe(2);
    spy.mockRestore();
  });

  it("6. 403: exactamente 1 petición, sin reintento, ServicioNoDisponible", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 200, { access_token: "tok1", expires_in: 3600 });
      if (req.method === "GET" && req.url === "/boletas/b1") return json(res, 403, {});
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl);
    await expect(gw.obtenerBoleta("b1")).rejects.toBeInstanceOf(ServicioNoDisponible);
    expect(s.counts["GET /boletas/b1"]).toBe(1);
    spy.mockRestore();
  });

  it("7. 404 en boleta y en evento -> null, sin reintentos", async () => {
    const s = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 200, { access_token: "tok1", expires_in: 3600 });
      if (req.method === "GET" && req.url?.startsWith("/boletas/")) return json(res, 404, {});
      if (req.method === "GET" && req.url?.startsWith("/eventos/")) return json(res, 404, {});
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl);
    expect(await gw.obtenerBoleta("x")).toBeNull();
    expect(await gw.obtenerEvento("y")).toBeNull();
    expect(s.counts["GET /boletas/x"]).toBe(1);
    expect(s.counts["GET /eventos/y"]).toBe(1);
  });

  it("8a. 503 dos veces y luego 200 (maxRetries=2) -> devuelve resultado", async () => {
    const s = await startServer((req, res, counts) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 200, { access_token: "tok1", expires_in: 3600 });
      if (req.method === "GET" && req.url === "/boletas/b1") {
        if ((counts["GET /boletas/b1"] ?? 0) <= 2) return json(res, 503, {});
        return json(res, 200, boletaOk);
      }
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl, { maxRetries: 2 });
    const r = await gw.obtenerBoleta("b1");
    expect(r).toEqual(boletaOk);
    expect(s.counts["GET /boletas/b1"]).toBe(3);
  });

  it("8b. 503 siempre -> ServicioNoDisponible tras maxRetries+1 intentos", async () => {
    const s = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 200, { access_token: "tok1", expires_in: 3600 });
      if (req.method === "GET" && req.url === "/boletas/b1") return json(res, 503, {});
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl, { maxRetries: 2 });
    await expect(gw.obtenerBoleta("b1")).rejects.toBeInstanceOf(ServicioNoDisponible);
    expect(s.counts["GET /boletas/b1"]).toBe(3);
  });

  it("9. Timeout -> reintenta y termina en ServicioNoDisponible", async () => {
    const s = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 200, { access_token: "tok1", expires_in: 3600 });
      if (req.method === "GET" && req.url === "/boletas/b1") {
        setTimeout(() => json(res, 200, boletaOk), 300);
        return;
      }
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl, { timeoutMs: 100, maxRetries: 2 });
    await expect(gw.obtenerBoleta("b1")).rejects.toBeInstanceOf(ServicioNoDisponible);
    expect(s.counts["GET /boletas/b1"]).toBe(3);
  });

  it("10. JSON válido pero esquema inválido -> ServicioNoDisponible sin reintentos", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 200, { access_token: "tok1", expires_in: 3600 });
      if (req.method === "GET" && req.url === "/boletas/b1") return json(res, 200, { nope: true });
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl);
    await expect(gw.obtenerBoleta("b1")).rejects.toBeInstanceOf(ServicioNoDisponible);
    expect(s.counts["GET /boletas/b1"]).toBe(1);
    spy.mockRestore();
  });

  it("11. Endpoint de token responde 401 -> ServicioNoDisponible", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 401, {});
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl);
    await expect(gw.obtenerBoleta("b1")).rejects.toBeInstanceOf(ServicioNoDisponible);
    spy.mockRestore();
  });

  it("12. console.error no contiene client_secret ni token", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "super-secret-value";
    const s = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 401, {});
      json(res, 500, {});
    });
    servers.push(s);
    const gw = makeClient(s.baseUrl, { clientSecret: secret });
    await expect(gw.obtenerBoleta("b1")).rejects.toBeInstanceOf(ServicioNoDisponible);

    // also trigger 403 path which logs
    const s2 = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/token") return json(res, 200, { access_token: "tok-secret", expires_in: 3600 });
      if (req.method === "GET" && req.url === "/boletas/b1") return json(res, 403, {});
      json(res, 500, {});
    });
    servers.push(s2);
    const gw2 = makeClient(s2.baseUrl, { clientSecret: secret });
    await expect(gw2.obtenerBoleta("b1")).rejects.toBeInstanceOf(ServicioNoDisponible);

    const all = spy.mock.calls.map((c) => c.map((x) => String(x)).join(" ")).join("\n");
    expect(all).not.toContain(secret);
    expect(all).not.toContain("tok-secret");
    expect(all).not.toContain("Bearer");
    spy.mockRestore();
  });
});
