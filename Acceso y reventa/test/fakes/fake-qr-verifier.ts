import type { QrVerifier } from "../../src/application/ports/out/qr-verifier.ts";

export class FakeQrVerifier implements QrVerifier {
  public valid = true;
  public calls = { verificar: 0 };

  verificar(_codigo: string, _firma: string): boolean {
    this.calls.verificar++;
    return this.valid;
  }
}
