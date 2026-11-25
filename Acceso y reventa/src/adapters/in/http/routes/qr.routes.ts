import { Router } from "express";
import type { GenerarQrBoleta } from "../../../../application/use-cases/generar-qr-boleta.ts";
import { generarQrBoletaController } from "../controllers/qr.controller.ts";

export function qrRoutes(generarQrBoleta: GenerarQrBoleta): Router {
  return Router().get("/boletas/:codigo/qr", generarQrBoletaController(generarQrBoleta));
}
