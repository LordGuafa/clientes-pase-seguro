import { z } from "zod";
import type { AccesosGateway } from "../../../application/ports/out/accesos-gateway.ts";
import type { Acceso } from "../../../domain/model/acceso.ts";
import { AccesoAceptadoDuplicado, ServicioNoDisponible } from "../../../domain/errors.ts";
import type { GatewayHttpClient } from "./http-client.ts";

const servicio = "CRUD Accesos y reventas";
const estado = z.object({ boletaCodigo: z.string(), ingreso: z.boolean(), bloqueada: z.boolean(), transferencias: z.number().int().nonnegative() });
const acceso = z.object({
  id: z.string().min(1), boletaCodigo: z.string(), eventoId: z.string(), puerta: z.string(),
  registradoEn: z.iso.datetime({ offset: true }).transform(s => new Date(s)),
  resultado: z.enum(["aceptado", "rechazado"]), motivo: z.string().nullable(),
});
const pagina = z.object({ items: z.array(acceso).length(1) });

export class AccesosGatewayHttp implements AccesosGateway {
  constructor(private readonly http: GatewayHttpClient) {}

  async obtenerEstado(codigo: string) {
    const res = await this.http.getJson(`/boletas/${encodeURIComponent(codigo)}/estado-acceso`, servicio);
    const parsed = estado.safeParse(res.status === 200 && res.body);
    if (!parsed.success || parsed.data.boletaCodigo !== codigo) throw new ServicioNoDisponible(servicio);
    return parsed.data;
  }

  async primerIngreso(codigo: string) {
    const filtros = new URLSearchParams({ boletaCodigo: codigo, resultado: "aceptado", tamano: "1" });
    const res = await this.http.getJson(`/accesos?${filtros}`, servicio);
    const parsed = pagina.safeParse(res.status === 200 && res.body);
    const primero = parsed.success && parsed.data.items[0];
    if (!primero || primero.boletaCodigo !== codigo || primero.resultado !== "aceptado") throw new ServicioNoDisponible(servicio);
    return primero;
  }

  async registrar(intento: Omit<Acceso, "id" | "registradoEn">) {
    const res = await this.http.postJson("/accesos", servicio, intento);
    if (res.status === 409) {
      if (intento.resultado === "aceptado" && z.object({ codigo: z.literal("acceso_duplicado") }).safeParse(res.body).success) {
        throw new AccesoAceptadoDuplicado();
      }
      throw new ServicioNoDisponible(servicio);
    }
    const parsed = acceso.safeParse(res.body);
    if (!parsed.success || parsed.data.boletaCodigo !== intento.boletaCodigo || parsed.data.resultado !== intento.resultado) throw new ServicioNoDisponible(servicio);
    return parsed.data;
  }
}
