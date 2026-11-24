import { Router } from "express";
import type { ValidarIngreso } from "../../../../application/use-cases/validar-ingreso.ts";
import { validarIngresoController } from "../controllers/accesos.controller.ts";

export function accesosRoutes(validarIngreso: ValidarIngreso): Router {
  return Router().post("/accesos/validar", validarIngresoController(validarIngreso));
}
