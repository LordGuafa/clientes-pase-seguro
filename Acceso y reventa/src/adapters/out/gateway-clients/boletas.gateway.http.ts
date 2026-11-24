import { z } from "zod";
import { ServicioNoDisponible } from "../../../domain/errors.ts";
import type {
  BoletaRef,
  BoletasGateway,
  EventoRef,
} from "../../../application/ports/out/boletas-gateway.ts";
import type { GatewayHttpClient } from "./http-client.ts";

const boletaSchema = z.object({
  codigo: z.string().min(1),
  eventoId: z.string().min(1),
  estado: z.string().min(1),
  propietarioId: z.string().nullable(),
  precioPagado: z.number().optional(),
});

const eventoSchema = z.object({
  id: z.string().min(1),
  estado: z.string().min(1),
  fechaHora: z.string().min(1),
  precioBase: z.number(),
  nombre: z.string().optional(),
  recinto: z.string().optional(),
});

export class BoletasGatewayHttp implements BoletasGateway {
  constructor(private readonly http: GatewayHttpClient) {}

  async obtenerBoleta(codigo: string): Promise<BoletaRef | null> {
    const res = await this.http.get(`/boletas/${encodeURIComponent(codigo)}`);
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200) {
      console.error(`Código inesperado ${res.status} al consultar boleta`);
      throw new ServicioNoDisponible("Eventos y boletas");
    }
    const parsed = boletaSchema.safeParse(res.body);
    if (!parsed.success) {
      console.error("Esquema inválido al consultar boleta en Eventos y boletas");
      throw new ServicioNoDisponible("Eventos y boletas");
    }
    return parsed.data;
  }

  async obtenerEvento(id: string): Promise<EventoRef | null> {
    const res = await this.http.get(`/eventos/${encodeURIComponent(id)}`);
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200) {
      console.error(`Código inesperado ${res.status} al consultar evento`);
      throw new ServicioNoDisponible("Eventos y boletas");
    }
    const parsed = eventoSchema.safeParse(res.body);
    if (!parsed.success) {
      console.error("Esquema inválido al consultar evento en Eventos y boletas");
      throw new ServicioNoDisponible("Eventos y boletas");
    }
    return parsed.data;
  }
}
