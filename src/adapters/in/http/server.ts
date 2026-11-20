import express from "express";
import type { Db } from "mongodb";
import type { ValidarIngreso } from "../../../application/use-cases/validar-ingreso.ts";
import { healthRoutes } from "./routes/health.routes.ts";
import { accesosRoutes } from "./routes/accesos.routes.ts";
import { errorHandler } from "./middlewares/error-handler.ts";

export function crearServidor(deps: {
  db: Db;
  validarIngreso: ValidarIngreso;
}) {
  const app = express();
  app.use(express.json());

  app.use(healthRoutes(deps.db));
  app.use(accesosRoutes(deps.validarIngreso));
  app.use(errorHandler);
  return app;
}
