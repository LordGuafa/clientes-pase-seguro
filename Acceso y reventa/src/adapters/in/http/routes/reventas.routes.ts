import { Router } from "express";
import type { ListarReventas } from "../../../../application/use-cases/listar-reventas.ts";
import { listarReventasController } from "../controllers/reventas.controller.ts";

export function reventasRoutes(listar: ListarReventas): Router {
  return Router().get("/reventas", listarReventasController(listar));
}
