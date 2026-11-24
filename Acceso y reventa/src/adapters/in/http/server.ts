import express from "express";
import type { Db } from "mongodb";
import type { ValidarIngreso } from "../../../application/use-cases/validar-ingreso.ts";
import type { ObtenerEstadoAcceso } from "../../../application/use-cases/obtener-estado-acceso.ts";
import type { GenerarQrBoleta } from "../../../application/use-cases/generar-qr-boleta.ts";
import { healthRoutes } from "./routes/health.routes.ts";
import { accesosRoutes } from "./routes/accesos.routes.ts";
import { estadoAccesoRoutes } from "./routes/estado-acceso.routes.ts";
import { qrRoutes } from "./routes/qr.routes.ts";
import { exigirGatewaySecret } from "./middlewares/gateway-secret.ts";
import { errorHandler } from "./middlewares/error-handler.ts";

export function crearServidor(deps: {
  db: Db;
  validarIngreso: ValidarIngreso;
  obtenerEstadoAcceso?: ObtenerEstadoAcceso;
  generarQrBoleta?: GenerarQrBoleta;
  gatewaySecret?: string;
}) {
  const app = express();
  app.use(express.json());
  app.use(exigirGatewaySecret(deps.gatewaySecret));

  app.use(healthRoutes(deps.db));
  app.use(accesosRoutes(deps.validarIngreso));
  if (deps.obtenerEstadoAcceso) {
    app.use(estadoAccesoRoutes(deps.obtenerEstadoAcceso));
  }
  if (deps.generarQrBoleta) {
    app.use(qrRoutes(deps.generarQrBoleta));
  }
  app.use(errorHandler);
  return app;
}
