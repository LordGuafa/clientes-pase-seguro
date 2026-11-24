import { afterEach, describe, expect, it, vi } from "vitest";
import { ValidarIngreso } from "../../../src/application/use-cases/validar-ingreso.ts";
import { DomainError, ServicioNoDisponible } from "../../../src/domain/errors.ts";
import { InMemoryAccesoRepository } from "../../fakes/in-memory-acceso-repository.ts";
import { FakeReventaRepository } from "../../fakes/fake-reventa-repository.ts";
import { FakeBoletasGateway } from "../../fakes/fake-boletas-gateway.ts";
import { FakeQrVerifier } from "../../fakes/fake-qr-verifier.ts";
import { fixedClock, sequentialIds } from "../../fakes/test-helpers.ts";

const BOLETA = "b7a1c2d3-1111-4222-8333-444455556666";
const QR_VALIDO = `${BOLETA}.firma`;
const EVENTO = "evt-1";

function build(opts?: {
  clockDate?: Date;
  qrValid?: boolean;
  boleta?: any;
  evento?: any;
  boletaNull?: boolean;
  eventoNull?: boolean;
  bloqueada?: boolean;
}) {
  const accesoRepo = new InMemoryAccesoRepository();
  const reventaRepo = new FakeReventaRepository();
  const boletasGateway = new FakeBoletasGateway();
  const qrVerifier = new FakeQrVerifier();
  const clock = fixedClock(opts?.clockDate ?? new Date("2026-11-19T15:00:00-05:00"));
  const generarId = sequentialIds("acc");

  if (opts?.qrValid === false) qrVerifier.valid = false;

  const boleta = opts?.boletaNull
    ? null
    : opts?.boleta ?? {
        codigo: BOLETA,
        eventoId: EVENTO,
        estado: "vendida",
        propietarioId: "usr-1",
      };
  if (boleta) boletasGateway.boletas.set(BOLETA, boleta);

  const evento = opts?.eventoNull
    ? null
    : opts?.evento ?? {
        id: EVENTO,
        estado: "activo",
        fechaHora: "2026-11-19T18:00:00-05:00",
        precioBase: 80000,
      };
  if (evento) boletasGateway.eventos.set(evento.id, evento);

  if (opts?.bloqueada) reventaRepo.blocked.add(BOLETA);

  const sut = new ValidarIngreso({
    accesoRepo,
    reventaRepo,
    boletasGateway,
    qrVerifier,
    clock,
    generarId,
  } as any);

  return { sut, accesoRepo, reventaRepo, boletasGateway, qrVerifier, clock };
}

async function expectDomain(p: Promise<any>, codigo: string) {
  try {
    await p;
    throw new Error("debió lanzar");
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).codigo).toBe(codigo);
    return e as DomainError;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ValidarIngreso", () => {
  it("1. QR con formato inválido -> qr_invalido y guarda rechazado con motivo", async () => {
    const { sut, accesoRepo, boletasGateway, reventaRepo } = build();
    await expectDomain(sut.ejecutar({ codigoQr: "invalido", puerta: "A", eventoId: EVENTO }), "qr_invalido");
    expect(accesoRepo.items).toHaveLength(1);
    expect(accesoRepo.items[0].resultado).toBe("rechazado");
    expect(accesoRepo.items[0].motivo).toBe("qr_invalido");
  });

  it("2. Firma inválida -> qr_invalido y NO consulta gateway ni reventas", async () => {
    const { sut, accesoRepo, boletasGateway, reventaRepo } = build({ qrValid: false });
    await expectDomain(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO }), "qr_invalido");
    expect(boletasGateway.calls.obtenerBoleta).toBe(0);
    expect(boletasGateway.calls.obtenerEvento).toBe(0);
    expect(reventaRepo.calls.existeSospechosaPorBoleta).toBe(0);
    expect(accesoRepo.items.some((i) => i.resultado === "rechazado" && i.motivo === "qr_invalido")).toBe(true);
  });

  it("3. Boleta inexistente -> boleta_inexistente", async () => {
    const { sut } = build({ boletaNull: true });
    await expectDomain(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO }), "boleta_inexistente");
  });

  it.each(["disponible", "reservada", "usada"] as const)(
    "4. Boleta en estado %s -> boleta_no_vendida",
    async (estado) => {
      const { sut } = build({ boleta: { codigo: BOLETA, eventoId: EVENTO, estado, propietarioId: "usr-1" } });
      await expectDomain(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO }), "boleta_no_vendida");
    },
  );

  it("5. Boleta de otro evento -> boleta_otro_evento", async () => {
    const { sut } = build({ boleta: { codigo: BOLETA, eventoId: "evt-otro", estado: "vendida", propietarioId: "usr-1" } });
    await expectDomain(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO }), "boleta_otro_evento");
  });

  it.each([
    ["inexistente", null],
    ["cancelado", { id: EVENTO, estado: "cancelado", fechaHora: "2026-11-19T18:00:00-05:00", precioBase: 1 }],
    ["finalizado", { id: EVENTO, estado: "finalizado", fechaHora: "2026-11-19T18:00:00-05:00", precioBase: 1 }],
  ] as const)("6. Evento %s -> evento_no_disponible", async (_name, evento) => {
    const { sut } = build(evento ? { evento: evento as any } : { eventoNull: true });
    await expectDomain(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO }), "evento_no_disponible");
  });

  it("7. Evento de otro día -> fuera_de_fecha", async () => {
    const { sut } = build({
      clockDate: new Date("2026-11-19T15:00:00-05:00"),
      evento: { id: EVENTO, estado: "activo", fechaHora: "2026-11-20T18:00:00-05:00", precioBase: 1 },
    });
    await expectDomain(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO }), "fuera_de_fecha");
  });

  it("8. Zona horaria America/Bogota: mismo día aunque UTC difiera -> acepta", async () => {
    const { sut, accesoRepo } = build({
      clockDate: new Date("2026-11-20T02:00:00Z"),
      evento: { id: EVENTO, estado: "activo", fechaHora: "2026-11-19T23:00:00Z", precioBase: 1 },
    });
    const r = await sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO });
    expect(r.resultado ?? "aceptado").toBe("aceptado");
    expect(accesoRepo.items.filter((i) => i.resultado === "aceptado")).toHaveLength(1);
  });

  it("8b. Zona horaria America/Bogota: caso inverso -> fuera_de_fecha", async () => {
    const { sut } = build({
      clockDate: new Date("2026-11-20T05:01:00Z"),
      evento: { id: EVENTO, estado: "activo", fechaHora: "2026-11-19T23:00:00Z", precioBase: 1 },
    });
    await expectDomain(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO }), "fuera_de_fecha");
  });

  it("9. Ya usada: primera 200, segunda boleta_ya_usada con primerIngreso", async () => {
    const clockDate = new Date("2026-11-19T15:00:00-05:00");
    const { sut } = build({ clockDate });
    const r1 = await sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO });
    const e = await expectDomain(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "B", eventoId: EVENTO }), "boleta_ya_usada");
    expect(e.detalle).toEqual({
      primerIngreso: { puerta: "A", registradoEn: r1.registradoEn.toISOString() },
    });
  });

  it("10. Bloqueada por reventa sospechosa -> boleta_bloqueada", async () => {
    const { sut } = build({ bloqueada: true });
    await expectDomain(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO }), "boleta_bloqueada");
  });

  it("11. Camino feliz: devuelve campos y deja 1 acceso aceptado", async () => {
    const clockDate = new Date("2026-11-19T15:00:00-05:00");
    const { sut, accesoRepo } = build({ clockDate });
    const r = await sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO });
    expect(r).toEqual({
      accesoId: "acc-1",
      boletaCodigo: BOLETA,
      eventoId: EVENTO,
      puerta: "A",
      registradoEn: clockDate,
    });
    expect(accesoRepo.items.filter((i) => i.resultado === "aceptado")).toHaveLength(1);
  });

  it("12. Carrera: buscar null pero guardar lanza duplicado -> boleta_ya_usada con primer ingreso", async () => {
    const clockDate = new Date("2026-11-19T15:00:00-05:00");
    const primero = {
      id: "acc-prev",
      boletaCodigo: BOLETA,
      eventoId: EVENTO,
      puerta: "Z",
      resultado: "aceptado" as const,
      motivo: null,
      registradoEn: new Date("2026-11-19T14:00:00-05:00"),
    };
    const { sut, accesoRepo } = build({ clockDate });
    accesoRepo.raceOnGuardarAceptado = true;
    accesoRepo.racePrimerAcceso = primero;
    const e = await expectDomain(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO }), "boleta_ya_usada");
    expect(e.detalle).toEqual({
      primerIngreso: { puerta: "Z", registradoEn: primero.registradoEn.toISOString() },
    });
  });

  it("13. Gateway caído al obtener boleta -> se propaga y sin acceso aceptado", async () => {
    const { sut, accesoRepo, boletasGateway } = build();
    boletasGateway.throwOnObtenerBoleta = new ServicioNoDisponible("Eventos y boletas");
    await expect(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO })).rejects.toBeInstanceOf(ServicioNoDisponible);
    expect(accesoRepo.items.filter((i) => i.resultado === "aceptado")).toHaveLength(0);
  });

  it("13b. Gateway caído al obtener evento -> se propaga y sin acceso aceptado", async () => {
    const { sut, accesoRepo, boletasGateway } = build();
    boletasGateway.throwOnObtenerEvento = new ServicioNoDisponible("Eventos y boletas");
    await expect(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO })).rejects.toBeInstanceOf(ServicioNoDisponible);
    expect(accesoRepo.items.filter((i) => i.resultado === "aceptado")).toHaveLength(0);
  });

  it("14. Fallo al guardar un rechazo -> igual se lanza DomainError original", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { sut, accesoRepo } = build({ qrValid: false });
    accesoRepo.failGuardarResultado = "rechazado";
    accesoRepo.failGuardarError = new Error("db down");
    await expectDomain(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO }), "qr_invalido");
  });

  it("15. Fallo genérico al guardar el aceptado -> se propaga y no es boleta_ya_usada", async () => {
    const { sut, accesoRepo } = build();
    accesoRepo.failGuardarResultado = "aceptado";
    accesoRepo.failGuardarError = new Error("db down");
    await expect(sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO })).rejects.toThrow("db down");
    try {
      await sut.ejecutar({ codigoQr: QR_VALIDO, puerta: "A", eventoId: EVENTO });
    } catch (e) {
      expect(e).not.toBeInstanceOf(DomainError);
    }
  });
});
