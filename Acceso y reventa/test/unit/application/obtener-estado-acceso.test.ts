import { describe, expect, it } from "vitest";
import { ObtenerEstadoAcceso } from "../../../src/application/use-cases/obtener-estado-acceso.ts";
import { InMemoryAccesoRepository } from "../../fakes/in-memory-acceso-repository.ts";
import { FakeReventaRepository } from "../../fakes/fake-reventa-repository.ts";

const BOLETA = "b7a1c2d3-1111-4222-8333-444455556666";
const OTRA_BOLETA = "aaaaaaaa-1111-4222-8333-444455556666";

function setup() {
  const accesoRepo = new InMemoryAccesoRepository();
  const reventaRepo = new FakeReventaRepository();
  const sut = new ObtenerEstadoAcceso({ accesoRepo, reventaRepo });
  return { sut, accesoRepo, reventaRepo };
}

describe("ObtenerEstadoAcceso (A-HU2)", () => {
  it("1. Boleta sin historial devuelve ingreso: false, transferencias: 0, bloqueada: false (no lanza error)", async () => {
    const { sut } = setup();
    const res = await sut.ejecutar(BOLETA);

    expect(res).toEqual({
      boletaCodigo: BOLETA,
      ingreso: false,
      transferencias: 0,
      bloqueada: false,
    });
  });

  it("2. Intentos de ingreso rechazados no marcan ingreso como true", async () => {
    const { sut, accesoRepo } = setup();
    await accesoRepo.guardar({
      id: "acc-1",
      boletaCodigo: BOLETA,
      eventoId: "evt-1",
      puerta: "A",
      resultado: "rechazado",
      motivo: "qr_invalido",
      registradoEn: new Date("2026-11-21T19:00:00Z"),
    });

    const res = await sut.ejecutar(BOLETA);
    expect(res.ingreso).toBe(false);
  });

  it("3. Un ingreso aceptado previo refleja ingreso: true", async () => {
    const { sut, accesoRepo } = setup();
    await accesoRepo.guardar({
      id: "acc-1",
      boletaCodigo: BOLETA,
      eventoId: "evt-1",
      puerta: "B",
      resultado: "aceptado",
      motivo: null,
      registradoEn: new Date("2026-11-21T19:05:00Z"),
    });

    const res = await sut.ejecutar(BOLETA);
    expect(res.ingreso).toBe(true);
  });

  it("4. Cuenta únicamente las transferencias con estado 'completada' de esa boleta", async () => {
    const { sut, reventaRepo } = setup();
    reventaRepo.items.push(
      {
        id: "rev-1",
        boletaCodigo: BOLETA,
        vendedorId: "u1",
        compradorId: "u2",
        precio: 85000,
        estado: "completada",
        marcaSospechosa: false,
        registradaEn: new Date("2026-11-20T10:00:00Z"),
      },
      {
        id: "rev-2",
        boletaCodigo: BOLETA,
        vendedorId: "u2",
        compradorId: "u3",
        precio: 88000,
        estado: "completada",
        marcaSospechosa: false,
        registradaEn: new Date("2026-11-20T12:00:00Z"),
      },
      {
        id: "rev-3",
        boletaCodigo: BOLETA,
        vendedorId: "u3",
        compradorId: "u4",
        precio: 88000,
        estado: "pendiente",
        marcaSospechosa: false,
        registradaEn: new Date("2026-11-20T13:00:00Z"),
      },
      {
        id: "rev-4",
        boletaCodigo: OTRA_BOLETA,
        vendedorId: "u1",
        compradorId: "u9",
        precio: 85000,
        estado: "completada",
        marcaSospechosa: false,
        registradaEn: new Date("2026-11-20T14:00:00Z"),
      },
    );

    const res = await sut.ejecutar(BOLETA);
    expect(res.transferencias).toBe(2);
    expect(res.bloqueada).toBe(false);
  });

  it("5. Reventa marcada como sospechosa refleja bloqueada: true", async () => {
    const { sut, reventaRepo } = setup();
    reventaRepo.items.push({
      id: "rev-sos",
      boletaCodigo: BOLETA,
      vendedorId: "u1",
      compradorId: "u1",
      precio: 80000,
      estado: "cancelada",
      marcaSospechosa: true,
      registradaEn: new Date("2026-11-20T15:00:00Z"),
    });

    const res = await sut.ejecutar(BOLETA);
    expect(res.bloqueada).toBe(true);
  });

  it("6. Estado combinado refleja simultáneamente ingreso, transferencias y bloqueo", async () => {
    const { sut, accesoRepo, reventaRepo } = setup();
    await accesoRepo.guardar({
      id: "acc-ok",
      boletaCodigo: BOLETA,
      eventoId: "evt-1",
      puerta: "A",
      resultado: "aceptado",
      motivo: null,
      registradoEn: new Date("2026-11-21T20:00:00Z"),
    });
    reventaRepo.items.push({
      id: "rev-1",
      boletaCodigo: BOLETA,
      vendedorId: "u1",
      compradorId: "u2",
      precio: 85000,
      estado: "completada",
      marcaSospechosa: true,
      registradaEn: new Date("2026-11-20T10:00:00Z"),
    });

    const res = await sut.ejecutar(BOLETA);
    expect(res).toEqual({
      boletaCodigo: BOLETA,
      ingreso: true,
      transferencias: 1,
      bloqueada: true,
    });
  });
});
