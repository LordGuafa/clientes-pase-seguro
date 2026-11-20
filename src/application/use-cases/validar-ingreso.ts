import { DomainError, AccesoAceptadoDuplicado } from "../../domain/errors.ts";
import { parseQr } from "../../domain/qr-codigo.ts";
import type { AccesoRepository } from "../ports/out/acceso-repository.ts";
import type { ReventaRepository } from "../ports/out/reventas-repository.ts";
import type { BoletasGateway } from "../ports/out/boletas-gateway.ts";
import type { QrVerifier } from "../ports/out/qr-verifier.ts";

export interface ValidarIngresoInput {
  codigoQr: string;
  puerta: string;
  eventoId: string;
}

export interface ValidarIngresoOutput {
  accesoId: string;
  boletaCodigo: string;
  eventoId: string;
  puerta: string;
  registradoEn: Date;
}

interface Deps {
  accesoRepo: AccesoRepository;
  reventaRepo: ReventaRepository;
  boletasGateway: BoletasGateway;
  qrVerifier: QrVerifier;
  clock: { ahora(): Date };
  generarId: () => string;
}

// Fecha calendario en hora de Bogotá, para comparar "en su día"
const dia = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

export class ValidarIngreso {
  constructor(private readonly d: Deps) {}

  async ejecutar(input: ValidarIngresoInput): Promise<ValidarIngresoOutput> {
    // 1. Formato y firma del QR
    const qr = parseQr(input.codigoQr);
    if (!qr || !this.d.qrVerifier.verificar(qr.codigo, qr.firma)) {
      return this.rechazar(
        input,
        qr?.codigo ?? "desconocido",
        "qr_invalido",
        "El código QR no es válido",
      );
    }
    const { codigo } = qr;

    // 2. La boleta existe y está vendida
    const boleta = await this.d.boletasGateway.obtenerBoleta(codigo);
    if (!boleta)
      return this.rechazar(
        input,
        codigo,
        "boleta_inexistente",
        "La boleta no existe",
      );
    if (boleta.estado !== "vendida") {
      return this.rechazar(
        input,
        codigo,
        "boleta_no_vendida",
        "La boleta no está vendida",
      );
    }

    // 3. Es del evento indicado, el evento está activo y es hoy
    if (boleta.eventoId !== input.eventoId) {
      return this.rechazar(
        input,
        codigo,
        "boleta_otro_evento",
        "La boleta es de otro evento",
      );
    }
    const evento = await this.d.boletasGateway.obtenerEvento(boleta.eventoId);
    if (!evento || evento.estado !== "activo") {
      return this.rechazar(
        input,
        codigo,
        "evento_no_disponible",
        "El evento no está activo",
      );
    }
    if (dia(new Date(evento.fechaHora)) !== dia(this.d.clock.ahora())) {
      return this.rechazar(
        input,
        codigo,
        "fuera_de_fecha",
        "El evento no es hoy",
      );
    }

    // 4. ¿Ya ingresó?
    const previo = await this.d.accesoRepo.buscarAceptadoPorBoleta(codigo);
    if (previo) return this.rechazarPorUsada(input, codigo, previo);

    // 5. ¿Bloqueada por reventa sospechosa?
    if (await this.d.reventaRepo.existeSospechosaPorBoleta(codigo)) {
      return this.rechazar(
        input,
        codigo,
        "boleta_bloqueada",
        "La boleta está bloqueada",
      );
    }

    // 6. Registrar el ingreso. El índice único cierra la carrera entre dos escaneos simultáneos.
    const acceso = {
      id: this.d.generarId(),
      boletaCodigo: codigo,
      eventoId: input.eventoId,
      puerta: input.puerta,
      resultado: "aceptado" as const,
      motivo: null,
      registradoEn: this.d.clock.ahora(),
    };
    try {
      await this.d.accesoRepo.guardar(acceso);
    } catch (e) {
      if (e instanceof AccesoAceptadoDuplicado) {
        const primero = await this.d.accesoRepo.buscarAceptadoPorBoleta(codigo);
        return this.rechazarPorUsada(input, codigo, primero);
      }
      throw e;
    }

    return {
      accesoId: acceso.id,
      boletaCodigo: codigo,
      eventoId: acceso.eventoId,
      puerta: acceso.puerta,
      registradoEn: acceso.registradoEn,
    };
  }

  private rechazarPorUsada(
    input: ValidarIngresoInput,
    codigo: string,
    primero: { puerta: string; registradoEn: Date } | null,
  ): Promise<never> {
    return this.rechazar(
      input,
      codigo,
      "boleta_ya_usada",
      "La boleta ya fue usada",
      {
        primerIngreso: primero && {
          puerta: primero.puerta,
          registradoEn: primero.registradoEn.toISOString(),
        },
      },
    );
  }

  // Cada rechazo queda registrado (A-HU1) y luego se lanza el error de dominio
  private async rechazar(
    input: ValidarIngresoInput,
    boletaCodigo: string,
    codigo: string,
    mensaje: string,
    detalle: Record<string, unknown> = {},
  ): Promise<never> {
    try {
      await this.d.accesoRepo.guardar({
        id: this.d.generarId(),
        boletaCodigo,
        eventoId: input.eventoId,
        puerta: input.puerta,
        resultado: "rechazado",
        motivo: codigo,
        registradoEn: this.d.clock.ahora(),
      });
    } catch (e) {
      console.error("No se pudo registrar el rechazo:", e);
    }
    throw new DomainError(codigo, mensaje, detalle);
  }
}
