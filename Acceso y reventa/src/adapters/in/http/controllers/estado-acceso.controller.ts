import type { RequestHandler } from "express";
import { z } from "zod";
import type { ObtenerEstadoAcceso } from "../../../../application/use-cases/obtener-estado-acceso.ts";

const codigoParamSchema = z.object({
  codigo: z.string().uuid("El código de la boleta debe ser un UUID válido"),
});

export function obtenerEstadoAccesoController(obtenerEstadoAcceso: ObtenerEstadoAcceso): RequestHandler {
  return async (req, res, next) => {
    try {
      const parsed = codigoParamSchema.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({
          codigo: "solicitud_invalida",
          mensaje: "El código de la boleta debe ser un UUID válido",
          detalle: {
            errores: parsed.error.issues.map((i) => ({
              campo: i.path.join("."),
              mensaje: i.message,
            })),
          },
        });
        return;
      }

      const resultado = await obtenerEstadoAcceso.ejecutar(parsed.data.codigo);
      res.status(200).json(resultado);
    } catch (e) {
      next(e);
    }
  };
}
