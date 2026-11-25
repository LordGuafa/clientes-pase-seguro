import type { Acceso, ResultadoAcceso } from "../../domain/model/acceso.ts";
import type { AccesoRepository } from "../ports/out/acceso-repository.ts";

export interface ListarAccesosInput {
  eventoId?: string;
  boletaCodigo?: string;
  resultado?: ResultadoAcceso;
  pagina: number;
  tamano: number;
}

export interface ListarAccesosOutput {
  items: Acceso[];
  total: number;
  pagina: number;
  tamano: number;
}

// A-HU1: consulta del registro de intentos de ingreso, con filtros y paginación
export class ListarAccesos {
  constructor(private readonly repo: Pick<AccesoRepository, "listar">) {}

  async ejecutar(input: ListarAccesosInput): Promise<ListarAccesosOutput> {
    const { items, total } = await this.repo.listar(input);
    return { items, total, pagina: input.pagina, tamano: input.tamano };
  }
}