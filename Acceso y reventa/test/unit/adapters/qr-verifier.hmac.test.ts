import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { QrVerifierHmac } from "../../../src/adapters/out/crypto/qr-verifier.hmac.ts";

describe("QrVerifierHmac", () => {
  const secret = "super-secreto-de-prueba";
  const codigo = "b7a1c2d3-1111-4222-8333-444455556666";
  const firma = createHmac("sha256", secret).update(codigo).digest("base64");
  const verifier = new QrVerifierHmac(secret);

  it("firma correcta pasa", () => {
    expect(verifier.verificar(codigo, firma)).toBe(true);
  });

  it("alterar un carácter falla", () => {
    const alterada = (firma.startsWith("A") ? "B" : "A") + firma.slice(1);
    expect(verifier.verificar(codigo, alterada)).toBe(false);
  });

  it("firma de distinta longitud devuelve false sin lanzar excepción", () => {
    expect(() => verifier.verificar(codigo, "corta")).not.toThrow();
    expect(verifier.verificar(codigo, "corta")).toBe(false);
  });

  it("secreto distinto falla", () => {
    const otro = new QrVerifierHmac("otro-secreto-distinto");
    expect(otro.verificar(codigo, firma)).toBe(false);
  });
});
