import { AccesoAceptadoDuplicado, DomainError } from "../../domain/errors.ts";
import type { Acceso, ResultadoAcceso } from "../../domain/model/acceso.ts";
import type { AccesoRepository } from "../ports/out/acceso-repository.ts";

export interface RegistrarAccesoInput {
  boletaCodigo: string;
  eventoId: string;
  puerta: string;
  resultado: ResultadoAcceso;
  motivo?: string | null;
}

interface Deps {
  accesoRepo: AccesoRepository;
  clock: { ahora(): Date };
  generarId: () => string;
}

// A-HU1: registra un intento de ingreso, aceptado o rechazado, con puerta, hora y motivo
export class RegistrarAcceso {
  constructor(private readonly d: Deps) {}

  async ejecutar(input: RegistrarAccesoInput): Promise<Acceso> {
    const motivo = input.motivo?.trim() || null;

    // Un rechazo sin motivo no le sirve a seguridad: el motivo es obligatorio
    if (input.resultado === "rechazado" && !motivo) {
      throw new DomainError(
        "motivo_requerido",
        "Un acceso rechazado debe indicar el motivo",
      );
    }

    const acceso: Acceso = {
      id: this.d.generarId(),
      boletaCodigo: input.boletaCodigo,
      eventoId: input.eventoId,
      puerta: input.puerta,
      resultado: input.resultado,
      // Un acceso aceptado no tiene motivo de rechazo
      motivo: input.resultado === "aceptado" ? null : motivo,
      // La hora la pone el servidor, no el cliente
      registradoEn: this.d.clock.ahora(),
    };

    try {
      await this.d.accesoRepo.guardar(acceso);
    } catch (e) {
      // El índice único impide dos accesos aceptados para la misma boleta
      if (e instanceof AccesoAceptadoDuplicado) {
        throw new DomainError(
          "acceso_duplicado",
          "La boleta ya tiene un acceso aceptado",
          { boletaCodigo: input.boletaCodigo },
        );
      }
      throw e;
    }
    return acceso;
  }
}