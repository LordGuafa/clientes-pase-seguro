import type { AccesoRepository } from "../ports/out/acceso-repository.ts";
import type { ReventaRepository } from "../ports/out/reventas-repository.ts";

export interface EstadoAccesoOutput {
  boletaCodigo: string;
  ingreso: boolean;
  transferencias: number;
  bloqueada: boolean;
}

interface Deps {
  accesoRepo: AccesoRepository;
  reventaRepo: ReventaRepository;
}

export class ObtenerEstadoAcceso {
  constructor(private readonly d: Deps) {}

  async ejecutar(boletaCodigo: string): Promise<EstadoAccesoOutput> {
    const [accesoAceptado, transferencias, bloqueada] = await Promise.all([
      this.d.accesoRepo.buscarAceptadoPorBoleta(boletaCodigo),
      this.d.reventaRepo.contarCompletadasPorBoleta
        ? this.d.reventaRepo.contarCompletadasPorBoleta(boletaCodigo)
        : Promise.resolve(0),
      this.d.reventaRepo.existeSospechosaPorBoleta(boletaCodigo),
    ]);

    return {
      boletaCodigo,
      ingreso: accesoAceptado !== null,
      transferencias,
      bloqueada,
    };
  }
}
