import { Router } from "express";
import type { ValidarIngreso } from "../../../../application/use-cases/validar-ingreso.ts";
import type { RegistrarAcceso } from "../../../../application/use-cases/registrar-acceso.ts";
import type { ListarAccesos } from "../../../../application/use-cases/listar-accesos.ts";
import {
  listarAccesosController,
  registrarAccesoController,
  validarIngresoController,
} from "../controllers/accesos.controller.ts";

export function accesosRoutes(deps: {
  validarIngreso: ValidarIngreso;
  registrarAcceso?: RegistrarAcceso;
  listarAccesos?: ListarAccesos;
}): Router {
  const router = Router().post("/accesos/validar", validarIngresoController(deps.validarIngreso));
  // A-HU1: registro y consulta de intentos de ingreso
  if (deps.registrarAcceso) router.post("/accesos", registrarAccesoController(deps.registrarAcceso));
  if (deps.listarAccesos) router.get("/accesos", listarAccesosController(deps.listarAccesos));
  return router;
}
