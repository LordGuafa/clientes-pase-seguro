import { Router } from "express";
import type { ObtenerEstadoAcceso } from "../../../../application/use-cases/obtener-estado-acceso.ts";
import { obtenerEstadoAccesoController } from "../controllers/estado-acceso.controller.ts";

export function estadoAccesoRoutes(obtenerEstadoAcceso: ObtenerEstadoAcceso): Router {
  return Router().get("/boletas/:codigo/estado-acceso", obtenerEstadoAccesoController(obtenerEstadoAcceso));
}
