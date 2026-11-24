import type { AccesoRepository } from "../../src/application/ports/out/acceso-repository.ts";
import type { Acceso } from "../../src/domain/model/acceso.ts";
import { AccesoAceptadoDuplicado } from "../../src/domain/errors.ts";

export class InMemoryAccesoRepository implements AccesoRepository {
  public items: Acceso[] = [];
  public calls = { guardar: 0, buscarAceptadoPorBoleta: 0, listar: 0 };
  public failGuardarResultado: "aceptado" | "rechazado" | null = null;
  public failGuardarError: Error | null = null;
  public raceOnGuardarAceptado = false;
  public racePrimerAcceso: Acceso | null = null;
  private raceBuscarCount = 0;

  async guardar(acceso: Acceso): Promise<void> {
    this.calls.guardar++;
    if (this.failGuardarResultado === acceso.resultado) {
      throw this.failGuardarError ?? new Error("fallo guardar");
    }
    if (acceso.resultado === "aceptado") {
      const ya = this.items.find(
        (a) => a.boletaCodigo === acceso.boletaCodigo && a.resultado === "aceptado",
      );
      if (ya || this.raceOnGuardarAceptado) {
        throw new AccesoAceptadoDuplicado();
      }
    }
    this.items.push({ ...acceso });
  }

  async buscarAceptadoPorBoleta(boletaCodigo: string): Promise<Acceso | null> {
    this.calls.buscarAceptadoPorBoleta++;
    if (this.raceOnGuardarAceptado) {
      this.raceBuscarCount++;
      if (this.raceBuscarCount === 1) return null;
      return this.racePrimerAcceso ? { ...this.racePrimerAcceso } : null;
    }
    const found = this.items.find(
      (a) => a.boletaCodigo === boletaCodigo && a.resultado === "aceptado",
    );
    return found ? { ...found } : null;
  }

  async listar(filtros: {
    eventoId?: string;
    boletaCodigo?: string;
    resultado?: "aceptado" | "rechazado";
    pagina: number;
    tamano: number;
  }): Promise<{ items: Acceso[]; total: number }> {
    this.calls.listar++;
    let r = [...this.items];
    if (filtros.eventoId) r = r.filter((i) => i.eventoId === filtros.eventoId);
    if (filtros.boletaCodigo) r = r.filter((i) => i.boletaCodigo === filtros.boletaCodigo);
    if (filtros.resultado) r = r.filter((i) => i.resultado === filtros.resultado);
    return { items: r, total: r.length };
  }
}
