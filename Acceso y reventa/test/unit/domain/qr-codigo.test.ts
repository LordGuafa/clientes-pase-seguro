import { describe, expect, it } from "vitest";
import { parseQr } from "../../../src/domain/qr-codigo.ts";

describe("parseQr", () => {
  it('acepta "uuid.firma"', () => {
    const r = parseQr("b7a1c2d3-1111-4222-8333-444455556666.abcdef");
    expect(r).toEqual({ codigo: "b7a1c2d3-1111-4222-8333-444455556666", firma: "abcdef" });
  });

  it("rechaza sin punto", () => {
    expect(parseQr("b7a1c2d3-1111-4222-8333-444455556666")).toBeNull();
  });

  it("rechaza con más de un punto", () => {
    expect(parseQr("b7a1c2d3-1111-4222-8333-444455556666.a.b")).toBeNull();
  });

  it("rechaza UUID inválido", () => {
    expect(parseQr("no-es-uuid.firma")).toBeNull();
  });

  it("rechaza firma vacía", () => {
    expect(parseQr("b7a1c2d3-1111-4222-8333-444455556666.")).toBeNull();
  });
});
