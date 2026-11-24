import { createHmac, timingSafeEqual } from "node:crypto";
import type { QrSigner, QrVerifier } from "../../../application/ports/out/qr-verifier.ts";

export class QrVerifierHmac implements QrVerifier, QrSigner {
  constructor(private readonly secret: string) {}

  //!Confirmar si usamos hex o base64url
  firmar(codigo: string): string {
    return createHmac("sha256", this.secret).update(codigo).digest("hex");
  }

  verificar(codigo: string, firma: string): boolean {
    const esperada = Buffer.from(this.firmar(codigo));
    const recibida = Buffer.from(firma);
    return (
      esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
    );
  }
}
