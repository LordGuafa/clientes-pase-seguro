import http from "node:http";
import type { Db } from "mongodb";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crearServidor } from "../../src/adapters/in/http/server.ts";
import { QrVerifierHmac } from "../../src/adapters/out/crypto/qr-verifier.hmac.ts";
import { QuickChartQrClient } from "../../src/adapters/out/external-qr/quickchart-qr.client.ts";
import { BoletasGatewayHttp } from "../../src/adapters/out/gateway-clients/boletas.gateway.http.ts";
import { GatewayHttpClient } from "../../src/adapters/out/gateway-clients/http-client.ts";
import { TokenProvider } from "../../src/adapters/out/gateway-clients/token-provider.ts";
import { GenerarQrBoleta } from "../../src/application/use-cases/generar-qr-boleta.ts";
import { ObtenerEstadoAcceso } from "../../src/application/use-cases/obtener-estado-acceso.ts";
import { ValidarIngreso } from "../../src/application/use-cases/validar-ingreso.ts";
import { FakeReventaRepository } from "../fakes/fake-reventa-repository.ts";
import { InMemoryAccesoRepository } from "../fakes/in-memory-acceso-repository.ts";
import { fixedClock, sequentialIds } from "../fakes/test-helpers.ts";

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const BOLETA_1 = "b7a1c2d3-1111-4222-8333-444455556666";
const BOLETA_2 = "c8b2d3e4-2222-4333-9444-555566667777";
const EVENTO_HOY = "evt-cine-1";
const GW_SECRET = "secreto-gateway-cluster";
const QR_SECRET = "secreto-qr-hmac-compartido-cluster";

async function startMockServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

describe("Integración de arquitectura completa (Gateway + EstadoAcceso A-HU2 + QR Externo + ValidarIngreso)", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    while (servers.length) {
      await servers.pop()!.close();
    }
  });

  it("comunica correctamente todos los módulos de punta a punta y maneja degradación del tercero", async () => {
    let tokenCalls = 0;
    let qrCalls = 0;
    let qrAvailable = true;

    // 1. Gateway simulado del clúster (emite JWT y enruta a Eventos y boletas)
    const mockGateway = await startMockServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "POST" && req.url === "/token") {
        tokenCalls++;
        res.statusCode = 200;
        res.end(JSON.stringify({ access_token: "jwt-cluster-token", expires_in: 3600 }));
        return;
      }
      if (req.headers.authorization !== "Bearer jwt-cluster-token") {
        res.statusCode = 401;
        res.end(JSON.stringify({ codigo: "no_autenticado", mensaje: "Token inválido" }));
        return;
      }
      if (req.method === "GET" && (req.url === `/boletas/${BOLETA_1}` || req.url === `/boletas/${BOLETA_2}`)) {
        const codigo = req.url.split("/").pop()!;
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            codigo,
            eventoId: EVENTO_HOY,
            estado: "vendida",
            propietarioId: "usr-comprador-1",
          }),
        );
        return;
      }
      if (req.method === "GET" && req.url === `/eventos/${EVENTO_HOY}`) {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            id: EVENTO_HOY,
            estado: "activo",
            fechaHora: "2026-11-24T19:00:00-05:00",
            precioBase: 25000,
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ codigo: "no_encontrado", mensaje: "No encontrado" }));
    });
    servers.push(mockGateway);

    // 2. API externa de QR simulada (QuickChart)
    const mockQuickChart = await startMockServer((_req, res) => {
      qrCalls++;
      if (!qrAvailable) {
        res.statusCode = 503;
        res.end("Service Unavailable");
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      res.end(MINIMAL_PNG);
    });
    servers.push(mockQuickChart);

    // 3. Ensamblaje real de la arquitectura hexagonal del servicio Acceso y reventa
    const accesoRepo = new InMemoryAccesoRepository();
    const reventaRepo = new FakeReventaRepository();
    reventaRepo.items.push({
      id: "rev-previa-1",
      boletaCodigo: BOLETA_1,
      vendedorId: "usr-0",
      compradorId: "usr-comprador-1",
      precio: 26000,
      estado: "completada",
      marcaSospechosa: false,
      registradaEn: new Date("2026-11-23T15:00:00-05:00"),
    });

    const tokenProvider = new TokenProvider({
      baseUrl: mockGateway.baseUrl,
      tokenPath: "/token",
      clientId: "mid-acceso",
      clientSecret: "sec-mid-acceso",
      timeoutMs: 1000,
    });
    const gatewayHttp = new GatewayHttpClient({
      baseUrl: mockGateway.baseUrl,
      tokenProvider,
      timeoutMs: 1000,
      maxRetries: 1,
      sleep: async () => {},
    });
    const boletasGateway = new BoletasGatewayHttp(gatewayHttp);
    const qrCrypto = new QrVerifierHmac(QR_SECRET);
    const qrImageClient = new QuickChartQrClient({
      baseUrl: `${mockQuickChart.baseUrl}/qr`,
      timeoutMs: 500,
      maxRetries: 1,
      cacheTtlMs: 60_000,
      sleep: async () => {},
    });

    const obtenerEstadoAcceso = new ObtenerEstadoAcceso({ accesoRepo, reventaRepo });
    const generarQrBoleta = new GenerarQrBoleta({
      boletasGateway,
      obtenerEstadoAcceso,
      qrSigner: qrCrypto,
      qrImageGenerator: qrImageClient,
    });
    const validarIngreso = new ValidarIngreso({
      accesoRepo,
      reventaRepo,
      boletasGateway,
      qrVerifier: qrCrypto,
      clock: fixedClock(new Date("2026-11-24T18:30:00-05:00")),
      generarId: sequentialIds("acc"),
    });

    const fakeDb = { command: async () => ({ ok: 1 }) } as unknown as Db;
    const app = crearServidor({
      listarReventas: new ListarReventas({ listar: async () => [] }),
      db: fakeDb,
      validarIngreso,
      obtenerEstadoAcceso,
      generarQrBoleta,
      gatewaySecret: GW_SECRET,
    });

    // Paso A: /health es pública, pero rutas de negocio rechazan tráfico sin X-Gateway-Secret
    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).get(`/boletas/${BOLETA_1}/estado-acceso`)).status).toBe(403);

    // Paso B (A-HU2 antes del ingreso): refleja 1 transferencia previa y ingreso: false
    const estadoInicial = await request(app)
      .get(`/boletas/${BOLETA_1}/estado-acceso`)
      .set("X-Gateway-Secret", GW_SECRET);
    expect(estadoInicial.status).toBe(200);
    expect(estadoInicial.body).toEqual({
      boletaCodigo: BOLETA_1,
      ingreso: false,
      transferencias: 1,
      bloqueada: false,
    });

    // Paso C (MID QR externo): genera QR firmado e imagen PNG (y segunda llamada sale de caché)
    const qrRes1 = await request(app)
      .get(`/boletas/${BOLETA_1}/qr`)
      .set("X-Gateway-Secret", GW_SECRET);
    expect(qrRes1.status).toBe(200);
    expect(qrRes1.body.degradado).toBe(false);
    expect(qrRes1.body.origenCache).toBe(false);
    expect(qrRes1.body.imagenBase64).toBe(MINIMAL_PNG.toString("base64"));

    const qrResCache = await request(app)
      .get(`/boletas/${BOLETA_1}/qr`)
      .set("X-Gateway-Secret", GW_SECRET);
    expect(qrResCache.status).toBe(200);
    expect(qrResCache.body.origenCache).toBe(true);
    expect(qrCalls).toBe(1);

    // Paso D (MID ValidarIngreso): el codigoQr emitido permite ingresar exactamente una vez
    const ingresoOk = await request(app)
      .post("/accesos/validar")
      .set("X-Gateway-Secret", GW_SECRET)
      .send({
        codigoQr: qrRes1.body.codigoQr,
        puerta: "Sala-3",
        eventoId: EVENTO_HOY,
      });
    expect(ingresoOk.status).toBe(200);
    expect(ingresoOk.body.resultado).toBe("aceptado");

    // Token OAuth2 se pidió una sola vez y se reutilizó entre GenerarQrBoleta y ValidarIngreso
    expect(tokenCalls).toBe(1);

    // Paso E (A-HU2 después del ingreso): estado-acceso refleja inmediatamente ingreso: true
    const estadoPostIngreso = await request(app)
      .get(`/boletas/${BOLETA_1}/estado-acceso`)
      .set("X-Gateway-Secret", GW_SECRET);
    expect(estadoPostIngreso.status).toBe(200);
    expect(estadoPostIngreso.body).toEqual({
      boletaCodigo: BOLETA_1,
      ingreso: true,
      transferencias: 1,
      bloqueada: false,
    });

    // Paso F: Segundo intento de ingreso o intento de regenerar QR se rechaza con 409 boleta_ya_usada
    const segundoIngreso = await request(app)
      .post("/accesos/validar")
      .set("X-Gateway-Secret", GW_SECRET)
      .send({
        codigoQr: qrRes1.body.codigoQr,
        puerta: "Sala-3",
        eventoId: EVENTO_HOY,
      });
    expect(segundoIngreso.status).toBe(409);
    expect(segundoIngreso.body.codigo).toBe("boleta_ya_usada");

    const qrReusada = await request(app)
      .get(`/boletas/${BOLETA_1}/qr`)
      .set("X-Gateway-Secret", GW_SECRET);
    expect(qrReusada.status).toBe(409);
    expect(qrReusada.body.codigo).toBe("boleta_ya_usada");

    // Paso G: Si el API externo de QR cae, BOLETA_2 degrada limpiamente y su codigoQr sigue funcionando en puerta
    vi.spyOn(console, "error").mockImplementation(() => {});
    qrAvailable = false;
    const qrDegradado = await request(app)
      .get(`/boletas/${BOLETA_2}/qr`)
      .set("X-Gateway-Secret", GW_SECRET);
    expect(qrDegradado.status).toBe(200);
    expect(qrDegradado.body.degradado).toBe(true);
    expect(qrDegradado.body.imagenBase64).toBeNull();

    const ingresoConQrDegradado = await request(app)
      .post("/accesos/validar")
      .set("X-Gateway-Secret", GW_SECRET)
      .send({
        codigoQr: qrDegradado.body.codigoQr,
        puerta: "Sala-1",
        eventoId: EVENTO_HOY,
      });
    expect(ingresoConQrDegradado.status).toBe(200);
    expect(ingresoConQrDegradado.body.resultado).toBe("aceptado");
  });
});
import { ListarReventas } from "../../src/application/use-cases/listar-reventas.ts";
