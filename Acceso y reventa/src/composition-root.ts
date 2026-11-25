import { randomUUID } from "node:crypto";
import { Db } from "mongodb";
import { AccesoRepositoryMongo } from "./adapters/out/mongo/acceso.repository.mongo.ts";
import { ReventaRepositoryMongo } from "./adapters/out/mongo/reventa.repository.mongo.ts";
import { ValidarIngreso } from "./application/use-cases/validar-ingreso.ts";
import { ListarReventas } from "./application/use-cases/listar-reventas.ts";
import { ObtenerEstadoAcceso } from "./application/use-cases/obtener-estado-acceso.ts";
import { GenerarQrBoleta } from "./application/use-cases/generar-qr-boleta.ts";
import { RegistrarAcceso } from "./application/use-cases/registrar-acceso.ts";
import { ListarAccesos } from "./application/use-cases/listar-accesos.ts";
import { QrVerifierHmac } from "./adapters/out/crypto/qr-verifier.hmac.ts";
import { TokenProvider } from "./adapters/out/gateway-clients/token-provider.ts";
import { GatewayHttpClient } from "./adapters/out/gateway-clients/http-client.ts";
import { BoletasGatewayHttp } from "./adapters/out/gateway-clients/boletas.gateway.http.ts";
import { QuickChartQrClient } from "./adapters/out/external-qr/quickchart-qr.client.ts";
import { crearServidor } from "./adapters/in/http/server.ts";

export function componer(
  db: Db,
  cfg: {
    qrSecret: string;
    gatewayUrl: string;
    gatewaySecret?: string;
    tokenPath: string;
    clientId: string;
    clientSecret: string;
    timeoutMs: number;
    maxRetries: number;
    qrApiUrl?: string;
    qrApiKey?: string;
    qrApiTimeoutMs?: number;
    qrApiMaxRetries?: number;
    qrCacheTtlMs?: number;
    qrCacheMaxItems?: number;
  },
) {
  const tokenProvider = new TokenProvider({
    baseUrl: cfg.gatewayUrl,
    tokenPath: cfg.tokenPath,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    timeoutMs: cfg.timeoutMs,
  });
  const httpClient = new GatewayHttpClient({
    baseUrl: cfg.gatewayUrl,
    tokenProvider,
    timeoutMs: cfg.timeoutMs,
    maxRetries: cfg.maxRetries,
  });

  const accesoRepo = new AccesoRepositoryMongo(db);
  const reventaRepo = new ReventaRepositoryMongo(db);
  const boletasGateway = new BoletasGatewayHttp(httpClient);
  const qrCrypto = new QrVerifierHmac(cfg.qrSecret);
  const qrImageGenerator = new QuickChartQrClient({
    baseUrl: cfg.qrApiUrl ?? "https://quickchart.io/qr",
    apiKey: cfg.qrApiKey,
    timeoutMs: cfg.qrApiTimeoutMs ?? 3000,
    maxRetries: cfg.qrApiMaxRetries ?? 2,
    cacheTtlMs: cfg.qrCacheTtlMs ?? 300_000,
    cacheMaxItems: cfg.qrCacheMaxItems ?? 500,
  });

  const clock = { ahora: () => new Date() };

  const obtenerEstadoAcceso = new ObtenerEstadoAcceso({
    accesoRepo,
    reventaRepo,
  });

  const generarQrBoleta = new GenerarQrBoleta({
    boletasGateway,
    obtenerEstadoAcceso,
    qrSigner: qrCrypto,
    qrImageGenerator,
  });

  const validarIngreso = new ValidarIngreso({
    accesoRepo,
    reventaRepo,
    boletasGateway,
    qrVerifier: qrCrypto,
    clock,
    generarId: randomUUID,
  });

  return crearServidor({
    listarReventas: new ListarReventas(reventaRepo),
    db,
    validarIngreso,
    registrarAcceso: new RegistrarAcceso({ accesoRepo, clock, generarId: randomUUID }),
    listarAccesos: new ListarAccesos(accesoRepo),
    obtenerEstadoAcceso,
    generarQrBoleta,
    gatewaySecret: cfg.gatewaySecret,
  });
}
