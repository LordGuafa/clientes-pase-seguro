import { describe, expect, it } from "vitest";
import { RegistrarAcceso } from "../../../src/application/use-cases/registrar-acceso.ts";
import { ListarAccesos } from "../../../src/application/use-cases/listar-accesos.ts";
import { DomainError } from "../../../src/domain/errors.ts";
import { InMemoryAccesoRepository } from "../../fakes/in-memory-acceso-repository.ts";
import { fixedClock, sequentialIds } from "../../fakes/test-helpers.ts";

const AHORA = new Date("2026-11-21T19:05:00Z");
const BASE = { boletaCodigo: "b7a1", eventoId: "evt-1", puerta: "A" };

function build() {
  const accesoRepo = new InMemoryAccesoRepository();
  const sut = new RegistrarAcceso({
    accesoRepo,
    clock: fixedClock(AHORA),
    generarId: sequentialIds("acc"),
  });
  return { sut, accesoRepo };
}

describe("RegistrarAcceso (A-HU1)", () => {
  it("guarda un acceso aceptado con puerta y hora del servidor, sin motivo", async () => {
    const { sut, accesoRepo } = build();
    const acceso = await sut.ejecutar({ ...BASE, resultado: "aceptado", motivo: "ignorado" });
    expect(acceso).toEqual({
      id: "acc-1", ...BASE, resultado: "aceptado", motivo: null, registradoEn: AHORA,
    });
    expect(accesoRepo.items).toHaveLength(1);
  });

  it("guarda un acceso rechazado con su motivo", async () => {
    const { sut, accesoRepo } = build();
    const acceso = await sut.ejecutar({ ...BASE, resultado: "rechazado", motivo: " qr_invalido " });
    expect(acceso.motivo).toBe("qr_invalido");
    expect(accesoRepo.items[0]).toMatchObject({ resultado: "rechazado", puerta: "A", registradoEn: AHORA });
  });

  it.each([undefined, null, "", "   "])("rechaza un rechazo sin motivo (%s)", async (motivo) => {
    const { sut, accesoRepo } = build();
    const err = await sut.ejecutar({ ...BASE, resultado: "rechazado", motivo }).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.codigo).toBe("motivo_requerido");
    expect(accesoRepo.items).toHaveLength(0);
  });

  it("permite varios rechazos de la misma boleta", async () => {
    const { sut, accesoRepo } = build();
    await sut.ejecutar({ ...BASE, resultado: "rechazado", motivo: "qr_invalido" });
    await sut.ejecutar({ ...BASE, resultado: "rechazado", motivo: "boleta_ya_usada" });
    expect(accesoRepo.items).toHaveLength(2);
  });

  it("un segundo acceso aceptado de la misma boleta responde acceso_duplicado", async () => {
    const { sut } = build();
    await sut.ejecutar({ ...BASE, resultado: "aceptado" });
    const err = await sut.ejecutar({ ...BASE, resultado: "aceptado" }).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.codigo).toBe("acceso_duplicado");
  });

  it("propaga errores inesperados del repositorio", async () => {
    const { sut, accesoRepo } = build();
    accesoRepo.failGuardarResultado = "aceptado";
    await expect(sut.ejecutar({ ...BASE, resultado: "aceptado" })).rejects.toThrow("fallo guardar");
  });
});

describe("ListarAccesos (A-HU1)", () => {
  it("filtra y devuelve la información de paginación", async () => {
    const { sut, accesoRepo } = build();
    await sut.ejecutar({ ...BASE, resultado: "aceptado" });
    await sut.ejecutar({ ...BASE, boletaCodigo: "b2", resultado: "rechazado", motivo: "qr_invalido" });
    const r = await new ListarAccesos(accesoRepo).ejecutar({ resultado: "rechazado", pagina: 1, tamano: 20 });
    expect(r.total).toBe(1);
    expect(r.items[0].boletaCodigo).toBe("b2");
    expect(r).toMatchObject({ pagina: 1, tamano: 20 });
  });
});