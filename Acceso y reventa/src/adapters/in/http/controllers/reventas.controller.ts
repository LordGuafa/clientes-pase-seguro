import type { RequestHandler } from "express";
import { z } from "zod";
import type { ListarReventas } from "../../../../application/use-cases/listar-reventas.ts";

const identificador = z.string().trim().min(1).optional();
const filtrosSchema = z.strictObject({
  vendedorId: identificador,
  boletaCodigo: identificador,
  marcaSospechosa: z.enum(["true", "false"]).transform(v => v === "true").optional(),
});

export function listarReventasController(listar: ListarReventas): RequestHandler {
  return async (req, res) => {
    const parsed = filtrosSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        codigo: "solicitud_invalida",
        mensaje: "Los filtros de la petición no son válidos",
        detalle: { errores: parsed.error.issues.flatMap(issue =>
          (issue.code === "unrecognized_keys" ? issue.keys : [issue.path.join(".")])
            .map(campo => ({ campo, mensaje: issue.message }))),
        },
      });
      return;
    }
    res.json(await listar.ejecutar(parsed.data));
  };
}
