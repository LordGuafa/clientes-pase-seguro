import { Router } from "express";
import { z } from "zod";
import type { ValidarIngreso } from "../../../../application/use-cases/validar-ingreso.ts";

const validarSchema = z.object({
  codigoQr: z.string().min(1).max(200),
  puerta: z.string().min(1).max(20),
  eventoId: z.string().min(1).max(100),
});

export function accesosRoutes(ValidarIngreso: ValidarIngreso): Router {
  const router = Router();
  router.post("/accesos/validar", async (req, res, next) => {
    try {
      const parsed = validarSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          codigo: "solicitud_invalida",
          mensaje: "El cuerpo de la petición no es válido",
          detalle: {
            errores: parsed.error.issues.map((i) => ({
              campo: i.path.join("."),
              mensaje: i.message,
            })),
          },
        });
        return;
      }
      const resultado = await ValidarIngreso.ejecutar(parsed.data);
      res.status(200).json({ resultado: "aceptado", ...resultado });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
