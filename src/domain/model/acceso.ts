export type ResultadoAcceso = "aceptado" | "rechazado";

export interface Acceso {
  id: string;
  boletaCodigo: string;
  eventoId: string;
  puerta: string;
  resultado: ResultadoAcceso;
  motivo: string | null;
  registradoEn: Date;
}
