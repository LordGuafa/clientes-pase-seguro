import { createHmac, timingSafeEqual } from "node:crypto";
import type { QrSigner, QrVerifier } from "../../../application/ports/out/qr-verifier.ts";

export class QrVerifierHmac implements QrVerifier, QrSigner {
  constructor(private readonly secret: string) {}

  firmar(codigo: string): string {
    return createHmac("sha256", this.secret).update(codigo).digest("hex");
  }

  verificar(codigo: string, firma: string): boolean {
    const esperada = this.firmar(codigo);
    const bufEsperada = Buffer.from(esperada, "utf8");
    const bufRecibida = Buffer.from(firma, "utf8");
    if (bufEsperada.length !== bufRecibida.length) {
      return false;
    }
    return timingSafeEqual(bufEsperada, bufRecibida);
  }
}
