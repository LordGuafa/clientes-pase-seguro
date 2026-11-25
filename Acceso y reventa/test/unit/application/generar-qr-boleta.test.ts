import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { QrVerifierHmac } from "../../../src/adapters/out/crypto/qr-verifier.hmac.ts";
import { errorHandler } from "../../../src/adapters/in/http/middlewares/error-handler.ts";
import { qrRoutes } from "../../../src/adapters/in/http/routes/qr.routes.ts";
import { GenerarQrBoleta } from "../../../src/application/use-cases/generar-qr-boleta.ts";
import { ObtenerEstadoAcceso } from "../../../src/application/use-cases/obtener-estado-acceso.ts";
import { DomainError, ServicioNoDisponible } from "../../../src/domain/errors.ts";
import { FakeBoletasGateway } from "../../fakes/fake-boletas-gateway.ts";
import { FakeQrImageGenerator } from "../../fakes/fake-qr-image-generator.ts";
import { FakeReventaRepository } from "../../fakes/fake-reventa-repository.ts";
import { InMemoryAccesoRepository } from "../../fakes/in-memory-acceso-repository.ts";

const BOLETA = "b7a1c2d3-1111-4222-8333-444455556666";
const SECRET = "secreto-hmac-compartido-pase-seguro";

function build() {
  const accesoRepo = new InMemoryAccesoRepository();
  const reventaRepo = new FakeReventaRepository();
  const boletasGateway = new FakeBoletasGateway();
  const qrCrypto = new QrVerifierHmac(SECRET);
  const qrImageGenerator = new FakeQrImageGenerator();

  boletasGateway.boletas.set(BOLETA, {
    codigo: BOLETA,
    eventoId: "evt-1",
    estado: "vendida",
    propietarioId: "usr-1",
  });

  const obtenerEstadoAcceso = new ObtenerEstadoAcceso({ accesoRepo, reventaRepo });
  const sut = new GenerarQrBoleta({
    boletasGateway,
    accesosGateway: { obtenerEstado: codigo => obtenerEstadoAcceso.ejecutar(codigo) },
    qrSigner: qrCrypto,
    qrImageGenerator,
  });

  const app = express();
  app.use(qrRoutes(sut));
  app.use(errorHandler);

  return {
    sut,
    app,
    accesoRepo,
    reventaRepo,
    boletasGateway,
    qrCrypto,
    qrImageGenerator,
  };
}

describe("GenerarQrBoleta (caso de uso MID + ruta HTTP)", () => {
  it("1. Camino feliz: firma el código con HMAC válido y obtiene la imagen del generador", async () => {
    const { sut, qrCrypto, qrImageGenerator } = build();

    const r = await sut.ejecutar({ boletaCodigo: BOLETA, tamanoPx: 320 });

    const [codigo, firma] = r.codigoQr.split(".");
    expect(codigo).toBe(BOLETA);
    expect(qrCrypto.verificar(codigo, firma)).toBe(true);
    expect(qrImageGenerator.calls).toEqual([{ contenidoQr: r.codigoQr, tamanoPx: 320 }]);
    expect(r.degradado).toBe(false);
    expect(r.imagenBase64).toBeTruthy();
    expect(r.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("2. Boleta inexistente -> boleta_inexistente (404)", async () => {
    const { sut, boletasGateway } = build();
    boletasGateway.boletas.clear();

    await expect(sut.ejecutar({ boletaCodigo: BOLETA })).rejects.toMatchObject({
      codigo: "boleta_inexistente",
    });
  });

  it("3. Boleta no vendida (ej. reservada) -> boleta_no_vendida (409)", async () => {
    const { sut, boletasGateway } = build();
    boletasGateway.boletas.set(BOLETA, {
      codigo: BOLETA,
      eventoId: "evt-1",
      estado: "reservada",
      propietarioId: "usr-1",
    });

    await expect(sut.ejecutar({ boletaCodigo: BOLETA })).rejects.toMatchObject({
      codigo: "boleta_no_vendida",
    });
  });

  it("4. Boleta con ingreso aceptado previo -> boleta_ya_usada (409)", async () => {
    const { sut, accesoRepo } = build();
    await accesoRepo.guardar({
      id: "acc-1",
      boletaCodigo: BOLETA,
      eventoId: "evt-1",
      puerta: "A",
      resultado: "aceptado",
      motivo: null,
      registradoEn: new Date(),
    });

    await expect(sut.ejecutar({ boletaCodigo: BOLETA })).rejects.toMatchObject({
      codigo: "boleta_ya_usada",
    });
  });

  it("5. Boleta bloqueada por reventa sospechosa -> boleta_bloqueada (403)", async () => {
    const { sut, reventaRepo } = build();
    reventaRepo.blocked.add(BOLETA);

    await expect(sut.ejecutar({ boletaCodigo: BOLETA })).rejects.toMatchObject({
      codigo: "boleta_bloqueada",
    });
  });

  it("6. Fallo del Gateway al consultar boleta -> propaga ServicioNoDisponible (503)", async () => {
    const { sut, boletasGateway } = build();
    boletasGateway.throwOnObtenerBoleta = new ServicioNoDisponible("Eventos y boletas");

    await expect(sut.ejecutar({ boletaCodigo: BOLETA })).rejects.toBeInstanceOf(
      ServicioNoDisponible,
    );
  });

  it("7. Ruta HTTP devuelve JSON con degradado: true cuando el tercero falla, y 503 si se exige formato=png", async () => {
    const { app, qrImageGenerator } = build();
    qrImageGenerator.nextResult = {
      formato: "image/png",
      imagenBase64: null,
      origenCache: false,
      degradado: true,
      motivoDegradacion: "proveedor_qr_no_disponible",
    };

    const resJson = await request(app).get(`/boletas/${BOLETA}/qr`);
    expect(resJson.status).toBe(200);
    expect(resJson.body.degradado).toBe(true);
    expect(resJson.body.imagenBase64).toBeNull();
    expect(resJson.body.codigoQr).toContain(`${BOLETA}.`);

    const resPng = await request(app).get(`/boletas/${BOLETA}/qr?formato=png`);
    expect(resPng.status).toBe(503);
    expect(resPng.body.codigo).toBe("proveedor_qr_no_disponible");
  });

  it("8. Ruta HTTP devuelve binario image/png cuando formato=png y el proveedor responde bien", async () => {
    const { app } = build();
    const res = await request(app).get(`/boletas/${BOLETA}/qr?formato=png&tamano=250`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(DomainError).toBeDefined();
  });
});
