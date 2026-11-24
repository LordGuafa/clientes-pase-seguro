import type { ErrorRequestHandler } from "express";
import { DomainError } from "../../../../domain/errors.ts";
const STATUS: Record<string, number> = {
  qr_invalido: 400,
  boleta_inexistente: 404,
  boleta_no_vendida: 409,
  boleta_otro_evento: 409,
  evento_no_disponible: 409,
  fuera_de_fecha: 409,
  boleta_ya_usada: 409,
  boleta_bloqueada: 403,
  servicio_no_disponible: 503,
};
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof DomainError) {
    res
      .status(STATUS[err.codigo] ?? 500)
      .json({ codigo: err.codigo, mensaje: err.message, detalle: err.detalle });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    console.error(err);
    res
      .status(500)
      .json({ codigo: "error_interno", mensaje: "Error interno", detalle: {} });
    return;
  }
  console.error(err);
  res
    .status(500)
    .json({ codigo: "error_interno", mensaje: "Error interno", detalle: {} });
};
