import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

const RUTAS_PUBLICAS = new Set(["/health", "/health/ready", "/openapi.json"]);

function esRutaPublica(path: string): boolean {
  return RUTAS_PUBLICAS.has(path) || path.startsWith("/docs");
}

function coincideSecreto(recibido: string | undefined, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function exigirGatewaySecret(gatewaySecret?: string): RequestHandler {
  return (req, res, next) => {
    if (!gatewaySecret || esRutaPublica(req.path)) {
      next();
      return;
    }
    if (coincideSecreto(req.get("X-Gateway-Secret"), gatewaySecret)) {
      next();
      return;
    }
    res.status(403).json({
      codigo: "no_gateway",
      mensaje: "Solo se acepta tráfico proveniente del API Gateway",
      detalle: {},
    });
  };
}
