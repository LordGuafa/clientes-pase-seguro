import type {
  BoletaRef,
  BoletasGateway,
  EventoRef,
} from "../../src/application/ports/out/boletas-gateway.ts";

export class FakeBoletasGateway implements BoletasGateway {
  public boletas = new Map<string, BoletaRef>();
  public eventos = new Map<string, EventoRef>();
  public calls = { obtenerBoleta: 0, obtenerEvento: 0 };
  public throwOnObtenerBoleta: Error | null = null;
  public throwOnObtenerEvento: Error | null = null;

  async obtenerBoleta(codigo: string): Promise<BoletaRef | null> {
    this.calls.obtenerBoleta++;
    if (this.throwOnObtenerBoleta) throw this.throwOnObtenerBoleta;
    return this.boletas.get(codigo) ?? null;
  }

  async obtenerEvento(id: string): Promise<EventoRef | null> {
    this.calls.obtenerEvento++;
    if (this.throwOnObtenerEvento) throw this.throwOnObtenerEvento;
    return this.eventos.get(id) ?? null;
  }
}
