import { DomainError } from "../../domain/errors.ts";
import type { BoletasGateway } from "../ports/out/boletas-gateway.ts";
import type { QrImageGenerator } from "../ports/out/qr-image-generator.ts";
import type { QrSigner } from "../ports/out/qr-verifier.ts";
import type { ObtenerEstadoAcceso } from "./obtener-estado-acceso.ts";

export interface GenerarQrBoletaInput {
  boletaCodigo: string;
  tamanoPx?: number;
}

export interface GenerarQrBoletaOutput {
  boletaCodigo: string;
  codigoQr: string;
  formato: "image/png";
  imagenBase64: string | null;
  dataUrl: string | null;
  origenCache: boolean;
  degradado: boolean;
  motivoDegradacion?: string;
}

interface Deps {
  boletasGateway: BoletasGateway;
  obtenerEstadoAcceso: ObtenerEstadoAcceso;
  qrSigner: QrSigner;
  qrImageGenerator: QrImageGenerator;
}

export class GenerarQrBoleta {
  constructor(private readonly d: Deps) {}

  async ejecutar(input: GenerarQrBoletaInput): Promise<GenerarQrBoletaOutput> {
    const { boletaCodigo, tamanoPx } = input;

    // 1. Verificar existencia y estado en Eventos y boletas (vía Gateway)
    const boleta = await this.d.boletasGateway.obtenerBoleta(boletaCodigo);
    if (!boleta) {
      throw new DomainError("boleta_inexistente", "La boleta no existe");
    }
    if (boleta.estado !== "vendida") {
      throw new DomainError(
        "boleta_no_vendida",
        "Solo se puede emitir el código QR para una boleta vendida",
      );
    }

    // 2. Consultar estado de acceso local (A-HU2: ingreso previo o bloqueo sospechoso)
    const estadoAcceso = await this.d.obtenerEstadoAcceso.ejecutar(boletaCodigo);
    if (estadoAcceso.ingreso) {
      throw new DomainError(
        "boleta_ya_usada",
        "La boleta ya fue usada para ingresar al evento",
      );
    }
    if (estadoAcceso.bloqueada) {
      throw new DomainError(
        "boleta_bloqueada",
        "La boleta está bloqueada por actividad de reventa sospechosa",
      );
    }

    // 3. Firmar el código QR con HMAC-SHA256 compartido y solicitar imagen al proveedor externo
    const firma = this.d.qrSigner.firmar(boletaCodigo);
    const codigoQr = `${boletaCodigo}.${firma}`;
    const img = await this.d.qrImageGenerator.generarImagenQr(codigoQr, tamanoPx);

    return {
      boletaCodigo,
      codigoQr,
      formato: img.formato,
      imagenBase64: img.imagenBase64,
      dataUrl: img.imagenBase64 ? `data:${img.formato};base64,${img.imagenBase64}` : null,
      origenCache: img.origenCache,
      degradado: img.degradado,
      ...(img.motivoDegradacion ? { motivoDegradacion: img.motivoDegradacion } : {}),
    };
  }
}
