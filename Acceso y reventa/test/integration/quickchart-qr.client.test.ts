import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickChartQrClient } from "../../src/adapters/out/external-qr/quickchart-qr.client.ts";

// PNG mínimo válido de 1x1 píxel transparente
const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

type Handler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  counts: Record<string, number>,
) => void | Promise<void>;

async function startQrServer(handler: Handler) {
  const counts: Record<string, number> = {};
  const server = http.createServer(async (req, res) => {
    counts.__total = (counts.__total ?? 0) + 1;
    await handler(req, res, counts);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  return {
    baseUrl: `http://127.0.0.1:${addr.port}/qr`,
    counts,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

const sleepNoop = async () => {};

describe("QuickChartQrClient (integración con mock HTTP local)", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    while (servers.length) {
      await servers.pop()!.close();
    }
  });

  it("1. Camino feliz: envía User-Agent y parámetros, valida PNG y devuelve Base64", async () => {
    let seenUrl = "";
    let seenUa = "";
    let seenKey = "";
    const s = await startQrServer((req, res) => {
      seenUrl = req.url ?? "";
      seenUa = String(req.headers["user-agent"] ?? "");
      seenKey = String(req.headers["x-quickchart-key"] ?? "");
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      res.end(MINIMAL_PNG);
    });
    servers.push(s);

    const client = new QuickChartQrClient({
      baseUrl: s.baseUrl,
      apiKey: "llave-opcional",
      timeoutMs: 1000,
      maxRetries: 2,
      cacheTtlMs: 60_000,
      sleep: sleepNoop,
    });

    const r = await client.generarImagenQr("uuid-1.firma-hmac", 250);
    expect(r).toEqual({
      formato: "image/png",
      imagenBase64: MINIMAL_PNG.toString("base64"),
      origenCache: false,
      degradado: false,
    });
    expect(seenUrl).toContain("text=uuid-1.firma-hmac");
    expect(seenUrl).toContain("size=250");
    expect(seenUa).toContain("PaseSeguro-AccesoReventa/1.0");
    expect(seenKey).toBe("llave-opcional");
    expect(s.counts.__total).toBe(1);
  });

  it("2. Caché con TTL: segunda solicitud igual usa caché sin llamar al tercero; al expirar vuelve a consultar", async () => {
    let nowMs = 1_000_000;
    const s = await startQrServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      res.end(MINIMAL_PNG);
    });
    servers.push(s);

    const client = new QuickChartQrClient({
      baseUrl: s.baseUrl,
      timeoutMs: 1000,
      maxRetries: 1,
      cacheTtlMs: 5000,
      clock: { ahora: () => new Date(nowMs) },
      sleep: sleepNoop,
    });

    const r1 = await client.generarImagenQr("codigo.firma", 300);
    const r2 = await client.generarImagenQr("codigo.firma", 300);
    expect(r1.origenCache).toBe(false);
    expect(r2.origenCache).toBe(true);
    expect(s.counts.__total).toBe(1);

    // Avanza el reloj más allá del TTL
    nowMs += 6000;
    const r3 = await client.generarImagenQr("codigo.firma", 300);
    expect(r3.origenCache).toBe(false);
    expect(s.counts.__total).toBe(2);
  });

  it("3. Single-flight: 5 peticiones concurrentes idénticas disparan 1 sola llamada HTTP", async () => {
    const s = await startQrServer((_req, res) => {
      setTimeout(() => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "image/png");
        res.end(MINIMAL_PNG);
      }, 20);
    });
    servers.push(s);

    const client = new QuickChartQrClient({
      baseUrl: s.baseUrl,
      timeoutMs: 1000,
      maxRetries: 2,
      cacheTtlMs: 60_000,
      sleep: sleepNoop,
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => client.generarImagenQr("concurrente.firma")),
    );
    expect(s.counts.__total).toBe(1);
    for (const r of results) {
      expect(r.degradado).toBe(false);
      expect(r.imagenBase64).toBe(MINIMAL_PNG.toString("base64"));
    }
  });

  it("4. Reintentos ante 503 y 429: falla 2 veces y se recupera en el 3er intento", async () => {
    const s = await startQrServer((_req, res, counts) => {
      if (counts.__total === 1) {
        res.statusCode = 503;
        res.end("unavailable");
        return;
      }
      if (counts.__total === 2) {
        res.statusCode = 429;
        res.end("rate limit");
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      res.end(MINIMAL_PNG);
    });
    servers.push(s);

    const client = new QuickChartQrClient({
      baseUrl: s.baseUrl,
      timeoutMs: 1000,
      maxRetries: 2,
      cacheTtlMs: 60_000,
      sleep: sleepNoop,
    });

    const r = await client.generarImagenQr("reintento.firma");
    expect(r.degradado).toBe(false);
    expect(r.imagenBase64).toBe(MINIMAL_PNG.toString("base64"));
    expect(s.counts.__total).toBe(3);
  });

  it("5. Plan de degradación ante caída total (503 persistente o timeout) sin filtrar llaves en logs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretKey = "API_KEY_ULTRA_SECRETA";
    const s = await startQrServer((_req, res) => {
      res.statusCode = 503;
      res.end("internal stack trace from third party");
    });
    servers.push(s);

    const client = new QuickChartQrClient({
      baseUrl: s.baseUrl,
      apiKey: secretKey,
      timeoutMs: 100,
      maxRetries: 2,
      cacheTtlMs: 60_000,
      sleep: sleepNoop,
    });

    const r = await client.generarImagenQr("caido.firma");
    expect(r).toEqual({
      formato: "image/png",
      imagenBase64: null,
      origenCache: false,
      degradado: true,
      motivoDegradacion: "proveedor_qr_no_disponible",
    });
    expect(s.counts.__total).toBe(3);

    const logs = spy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logs).not.toContain(secretKey);
    expect(logs).not.toContain("internal stack trace");
    spy.mockRestore();
  });

  it("6. Timeout del proveedor reintenta y activa degradación limpia", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await startQrServer((_req, res) => {
      setTimeout(() => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "image/png");
        res.end(MINIMAL_PNG);
      }, 250);
    });
    servers.push(s);

    const client = new QuickChartQrClient({
      baseUrl: s.baseUrl,
      timeoutMs: 60,
      maxRetries: 1,
      cacheTtlMs: 60_000,
      sleep: sleepNoop,
    });

    const r = await client.generarImagenQr("lento.firma");
    expect(r.degradado).toBe(true);
    expect(r.imagenBase64).toBeNull();
    expect(s.counts.__total).toBe(2);
    spy.mockRestore();
  });

  it("7. Cuerpo corrupto o no-PNG no se guarda en caché y devuelve modo degradado", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await startQrServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      res.end(Buffer.from("esto no es un png real"));
    });
    servers.push(s);

    const client = new QuickChartQrClient({
      baseUrl: s.baseUrl,
      timeoutMs: 500,
      maxRetries: 1,
      cacheTtlMs: 60_000,
      sleep: sleepNoop,
    });

    const r = await client.generarImagenQr("corrupto.firma");
    expect(r.degradado).toBe(true);
    expect(r.imagenBase64).toBeNull();
    expect(s.counts.__total).toBe(1);
    spy.mockRestore();
  });
});
