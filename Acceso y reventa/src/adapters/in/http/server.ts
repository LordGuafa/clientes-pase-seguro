import express from "express";
import type { Db } from "mongodb";
import type { ValidarIngreso } from "../../../application/use-cases/validar-ingreso.ts";
import { healthRoutes } from "./routes/health.routes.ts";
import { accesosRoutes } from "./routes/accesos.routes.ts";
import { reventasRoutes } from "./routes/reventas.routes.ts";
import type { ListarReventas } from "../../../application/use-cases/listar-reventas.ts";
import type { RegistrarAcceso } from "../../../application/use-cases/registrar-acceso.ts";
import type { ListarAccesos } from "../../../application/use-cases/listar-accesos.ts";
import { errorHandler } from "./middlewares/error-handler.ts";

export function crearServidor(deps: {
  db: Db;
  validarIngreso: ValidarIngreso;
  registrarAcceso: RegistrarAcceso;
  listarAccesos: ListarAccesos;
  listarReventas: ListarReventas;
}) {
  const app = express();
  app.use(express.json());

  app.use(healthRoutes(deps.db));
  app.use(accesosRoutes(deps));
  app.use(reventasRoutes(deps.listarReventas));
  app.use(errorHandler);
  return app;
}
