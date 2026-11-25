export interface QrImageResult {
  formato: "image/png";
  imagenBase64: string | null;
  origenCache: boolean;
  degradado: boolean;
  motivoDegradacion?: string;
}

export interface QrImageGenerator {
  generarImagenQr(contenidoQr: string, tamanoPx?: number): Promise<QrImageResult>;
}
