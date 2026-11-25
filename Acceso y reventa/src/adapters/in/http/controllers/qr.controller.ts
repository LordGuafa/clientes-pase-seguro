import type { RequestHandler } from "express";
import { z } from "zod";
import { DomainError } from "../../../../domain/errors.ts";
import type { GenerarQrBoleta } from "../../../../application/use-cases/generar-qr-boleta.ts";

const codigoParamSchema = z.object({
  codigo: z.string().uuid("El código de la boleta debe ser un UUID válido"),
});

const qrQuerySchema = z.object({
  tamano: z.coerce.number().int().min(100).max(1000).optional(),
  formato: z.enum(["json", "png"]).optional(),
});

export function generarQrBoletaController(generarQrBoleta: GenerarQrBoleta): RequestHandler {
  return async (req, res, next) => {
    try {
      const parsedParams = codigoParamSchema.safeParse(req.params);
      if (!parsedParams.success) {
        res.status(400).json({
          codigo: "solicitud_invalida",
          mensaje: "El código de la boleta debe ser un UUID válido",
          detalle: {
            errores: parsedParams.error.issues.map((i) => ({
              campo: i.path.join("."),
              mensaje: i.message,
            })),
          },
        });
        return;
      }

      const parsedQuery = qrQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        res.status(400).json({
          codigo: "solicitud_invalida",
          mensaje: "Parámetros de consulta inválidos",
          detalle: {
            errores: parsedQuery.error.issues.map((i) => ({
              campo: i.path.join("."),
              mensaje: i.message,
            })),
          },
        });
        return;
      }

      const resultado = await generarQrBoleta.ejecutar({
        boletaCodigo: parsedParams.data.codigo,
        tamanoPx: parsedQuery.data.tamano,
      });

      const pidePngDirecto =
        parsedQuery.data.formato === "png" ||
        (parsedQuery.data.formato === undefined &&
          req.accepts(["application/json", "image/png"]) === "image/png");

      if (pidePngDirecto) {
        if (resultado.degradado || !resultado.imagenBase64) {
          throw new DomainError(
            "proveedor_qr_no_disponible",
            "El proveedor externo de imágenes QR no está disponible temporalmente",
            { boletaCodigo: resultado.boletaCodigo, codigoQr: resultado.codigoQr },
          );
        }
        const pngBuffer = Buffer.from(resultado.imagenBase64, "base64");
        res.status(200).type("image/png").send(pngBuffer);
        return;
      }

      res.status(200).json(resultado);
    } catch (e) {
      next(e);
    }
  };
}
