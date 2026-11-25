import { z } from "zod";
import type {
  BoletaRef,
  BoletasGateway,
  EventoRef,
} from "../../../application/ports/out/boletas-gateway.ts";
import { ServicioNoDisponible } from "../../../domain/errors.ts";
import type { GatewayHttpClient } from "./http-client.ts";

const servicio = "Eventos y boletas";

function mapBoleta(body: unknown): BoletaRef {
  const campos = {
    codigo: z.string(),
    estado: z.enum(["disponible", "reservada", "vendida", "usada"]),
  };
  const schema = z.object({
    ...campos,
    propietarioId: z.string().nullable(),
    eventoId: z.string(),
  }).or(z.object({
    ...campos,
    evento_id: z.string(),
    propietario_id: z.string().nullable(),
  }).transform(({ codigo, estado, evento_id, propietario_id }) => ({
    codigo, estado, eventoId: evento_id, propietarioId: propietario_id,
  })));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error("Respuesta inválida del servicio de boletas");
    throw new ServicioNoDisponible(servicio);
  }
  return parsed.data;
}

function mapEvento(body: unknown): EventoRef {
  const campos = {
    id: z.string(),
    estado: z.enum(["activo", "cancelado", "finalizado"]),
  };
  const schema = z.object({
    ...campos,
    fechaHora: z.string(),
    precioBase: z.number(),
  }).or(z.object({
    ...campos,
    fecha_hora: z.string(),
    precio_base: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).pipe(z.number()),
  }).transform(({ id, estado, fecha_hora, precio_base }) => ({
    id, estado, precioBase: precio_base,
    fechaHora: /(?:Z|[+-]\d{2}:\d{2})$/.test(fecha_hora) ? fecha_hora : `${fecha_hora}Z`,
  })));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error("Respuesta inválida del servicio de eventos");
    throw new ServicioNoDisponible(servicio);
  }
  return parsed.data;
}

export class BoletasGatewayHttp implements BoletasGateway {
  constructor(private readonly http: GatewayHttpClient) {}

  async obtenerBoleta(codigo: string): Promise<BoletaRef | null> {
    const res = await this.http.getJson(
      `/boletas/${encodeURIComponent(codigo)}`,
      servicio,
    );
    if (res.status === 404) return null;
    return mapBoleta(res.body);
  }

  async obtenerEvento(id: string): Promise<EventoRef | null> {
    const res = await this.http.getJson(
      `/eventos/${encodeURIComponent(id)}`,
      servicio,
    );
    if (res.status === 404) return null;
    return mapEvento(res.body);
  }
}
