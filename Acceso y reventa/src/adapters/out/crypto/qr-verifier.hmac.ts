import { createHmac, timingSafeEqual } from "node:crypto";
import type { QrVerifier } from "../../../application/ports/out/qr-verifier.ts";

export class QrVerifierHmac implements QrVerifier {
  constructor(private readonly secret: string) {}

  //!Confirmar si usamos hex o base64url
  verificar(codigo: string, firma: string): boolean {
    const esperada = Buffer.from(
      createHmac("sha256", this.secret).update(codigo).digest("base64"),
    );
    const recibida = Buffer.from(firma);
    return (
      esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
    );
  }
}
