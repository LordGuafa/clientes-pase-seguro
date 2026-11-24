import type { RequestHandler } from "express";
import { z } from "zod";
import type { ValidarIngreso } from "../../../../application/use-cases/validar-ingreso.ts";
import type { RegistrarAcceso } from "../../../../application/use-cases/registrar-acceso.ts";
import type { ListarAccesos } from "../../../../application/use-cases/listar-accesos.ts";

const validarSchema = z.object({
  codigoQr: z.string().min(1).max(200),
  puerta: z.string().min(1).max(20),
  eventoId: z.string().min(1).max(100),
});

// A-HU1: cuerpo de POST /accesos. Si es rechazado, el motivo es obligatorio.
const registrarSchema = z
  .strictObject({
    boletaCodigo: z.string().trim().min(1).max(100),
    eventoId: z.string().trim().min(1).max(100),
    puerta: z.string().trim().min(1).max(20),
    resultado: z.enum(["aceptado", "rechazado"]),
    motivo: z.string().trim().max(200).nullable().optional(),
  })
  .refine((b) => b.resultado === "aceptado" || !!b.motivo, {
    path: ["motivo"],
    message: "El motivo es obligatorio cuando el resultado es rechazado",
  });

// A-HU1: filtros y paginación de GET /accesos
const identificador = z.string().trim().min(1).max(100).optional();
const listarSchema = z.strictObject({
  eventoId: identificador,
  boletaCodigo: identificador,
  resultado: z.enum(["aceptado", "rechazado"]).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(100).default(20),
});

function errores400(error: z.ZodError, mensaje: string) {
  return {
    codigo: "solicitud_invalida",
    mensaje,
    detalle: {
      errores: error.issues.flatMap((issue) =>
        (issue.code === "unrecognized_keys" ? issue.keys : [issue.path.join(".")])
          .map((campo) => ({ campo, mensaje: issue.message })),
      ),
    },
  };
}

export function validarIngresoController(validarIngreso: ValidarIngreso): RequestHandler {
  return async (req, res, next) => {
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
      const resultado = await validarIngreso.ejecutar(parsed.data);
      res.status(200).json({ resultado: "aceptado", ...resultado });
    } catch (e) {
      next(e);
    }
  };
}

export function registrarAccesoController(registrar: RegistrarAcceso): RequestHandler {
  return async (req, res, next) => {
    try {
      const parsed = registrarSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json(errores400(parsed.error, "El cuerpo de la petición no es válido"));
        return;
      }
      const acceso = await registrar.ejecutar(parsed.data);
      res.status(201).json(acceso);
    } catch (e) {
      next(e);
    }
  };
}

export function listarAccesosController(listar: ListarAccesos): RequestHandler {
  return async (req, res, next) => {
    try {
      const parsed = listarSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json(errores400(parsed.error, "Los filtros de la petición no son válidos"));
        return;
      }
      res.json(await listar.ejecutar(parsed.data));
    } catch (e) {
      next(e);
    }
  };
}
