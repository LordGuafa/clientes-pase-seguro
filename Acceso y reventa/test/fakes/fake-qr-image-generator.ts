import type {
  QrImageGenerator,
  QrImageResult,
} from "../../src/application/ports/out/qr-image-generator.ts";

export class FakeQrImageGenerator implements QrImageGenerator {
  public calls: Array<{ contenidoQr: string; tamanoPx?: number }> = [];
  public nextResult: QrImageResult = {
    formato: "image/png",
    imagenBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    origenCache: false,
    degradado: false,
  };

  async generarImagenQr(contenidoQr: string, tamanoPx?: number): Promise<QrImageResult> {
    this.calls.push({ contenidoQr, tamanoPx });
    return { ...this.nextResult };
  }
}
