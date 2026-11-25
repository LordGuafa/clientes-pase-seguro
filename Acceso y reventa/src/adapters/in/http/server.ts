import express from "express";
import type { Db } from "mongodb";
import type { ValidarIngreso } from "../../../application/use-cases/validar-ingreso.ts";
import type { ObtenerEstadoAcceso } from "../../../application/use-cases/obtener-estado-acceso.ts";
import type { GenerarQrBoleta } from "../../../application/use-cases/generar-qr-boleta.ts";
import type { ListarReventas } from "../../../application/use-cases/listar-reventas.ts";
import type { RegistrarAcceso } from "../../../application/use-cases/registrar-acceso.ts";
import type { ListarAccesos } from "../../../application/use-cases/listar-accesos.ts";
import { healthRoutes } from "./routes/health.routes.ts";
import { accesosRoutes } from "./routes/accesos.routes.ts";
import { reventasRoutes } from "./routes/reventas.routes.ts";
import { estadoAccesoRoutes } from "./routes/estado-acceso.routes.ts";
import { qrRoutes } from "./routes/qr.routes.ts";
import { exigirGatewaySecret } from "./middlewares/gateway-secret.ts";
import { errorHandler } from "./middlewares/error-handler.ts";

export function crearServidor(deps: {
  db: Db;
  validarIngreso: ValidarIngreso;
  listarReventas: ListarReventas;
  registrarAcceso?: RegistrarAcceso;
  listarAccesos?: ListarAccesos;
  obtenerEstadoAcceso?: ObtenerEstadoAcceso;
  generarQrBoleta?: GenerarQrBoleta;
  gatewaySecret?: string;
}) {
  const app = express();
  app.use(express.json());
  // Todo lo que no sea /health debe venir del gateway con la cabecera secreta
  app.use(exigirGatewaySecret(deps.gatewaySecret));

  app.use(healthRoutes(deps.db));
  app.use(accesosRoutes(deps));
  app.use(reventasRoutes(deps.listarReventas));
  if (deps.obtenerEstadoAcceso) {
    app.use(estadoAccesoRoutes(deps.obtenerEstadoAcceso));
  }
  if (deps.generarQrBoleta) {
    app.use(qrRoutes(deps.generarQrBoleta));
  }
  app.use(errorHandler);
  return app;
}
