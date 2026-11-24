import { z } from "zod";
import type {
  BoletaRef,
  BoletasGateway,
  EventoRef,
} from "../../../application/ports/out/boletas-gateway.ts";
import { ServicioNoDisponible } from "../../../domain/errors.ts";
import type { GatewayHttpClient } from "./http-client.ts";

const servicio = "Eventos y boletas";

// SUPUESTO: confirmar contrato con Eventos y boletas
function mapBoleta(body: unknown): BoletaRef {
  const schema = z.object({
    codigo: z.string(),
    eventoId: z.string(),
    estado: z.enum(["disponible", "reservada", "vendida", "usada"]),
    propietarioId: z.string().nullable(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error("Respuesta inválida del servicio de boletas");
    throw new ServicioNoDisponible(servicio);
  }
  return parsed.data;
}

// SUPUESTO: confirmar contrato con Eventos y boletas
function mapEvento(body: unknown): EventoRef {
  const schema = z.object({
    id: z.string(),
    estado: z.enum(["activo", "cancelado", "finalizado"]),
    fechaHora: z.string(),
    precioBase: z.number(),
  });
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
