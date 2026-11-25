import type { Acceso } from "../../../domain/model/acceso.ts";

export interface EstadoAcceso {
  boletaCodigo: string;
  ingreso: boolean;
  bloqueada: boolean;
  transferencias: number;
}

export interface AccesosGateway {
  obtenerEstado(codigo: string): Promise<EstadoAcceso>;
  primerIngreso(codigo: string): Promise<Pick<Acceso, "puerta" | "registradoEn">>;
  registrar(intento: Omit<Acceso, "id" | "registradoEn">): Promise<Acceso>;
}
