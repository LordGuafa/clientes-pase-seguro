import { randomUUID } from "node:crypto";
import { Db } from "mongodb";
import { AccesoRepositoryMongo } from "./adapters/out/mongo/acceso.repository.mongo.ts";
import { ReventaRepositoryMongo } from "./adapters/out/mongo/reventa.repository.mongo.ts";
import { ValidarIngreso } from "./application/use-cases/validar-ingreso.ts";
import { ListarReventas } from "./application/use-cases/listar-reventas.ts";
import { RegistrarAcceso } from "./application/use-cases/registrar-acceso.ts";
import { ListarAccesos } from "./application/use-cases/listar-accesos.ts";
import { QrVerifierHmac } from "./adapters/out/crypto/qr-verifier.hmac.ts";
import { TokenProvider } from "./adapters/out/gateway-clients/token-provider.ts";
import { GatewayHttpClient } from "./adapters/out/gateway-clients/http-client.ts";
import { BoletasGatewayHttp } from "./adapters/out/gateway-clients/boletas.gateway.http.ts";
import { crearServidor } from "./adapters/in/http/server.ts";

export function componer(
  db: Db,
  cfg: {
    qrSecret: string;
    gatewayUrl: string;
    tokenPath: string;
    clientId: string;
    clientSecret: string;
    timeoutMs: number;
    maxRetries: number;
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
  const reventaRepo = new ReventaRepositoryMongo(db);
  const accesoRepo = new AccesoRepositoryMongo(db);
  const clock = { ahora: () => new Date() };
  const validarIngreso = new ValidarIngreso({
    accesoRepo,
    reventaRepo,
    boletasGateway: new BoletasGatewayHttp(httpClient),
    qrVerifier: new QrVerifierHmac(cfg.qrSecret),
    clock,
    generarId: randomUUID,
  });
  return crearServidor({
    db,
    validarIngreso,
    registrarAcceso: new RegistrarAcceso({ accesoRepo, clock, generarId: randomUUID }),
    listarAccesos: new ListarAccesos(accesoRepo),
    listarReventas: new ListarReventas(reventaRepo),
  });
}