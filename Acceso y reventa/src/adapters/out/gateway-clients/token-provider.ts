import { z } from "zod";
import { ServicioNoDisponible } from "../../../domain/errors.ts";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
});

export interface TokenProviderConfig {
  baseUrl: string;
  tokenPath: string;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
}

export class TokenProvider {
  private cachedToken: string | null = null;
  private expiresAtMs = 0;
  private inflight: Promise<string> | null = null;

  constructor(private readonly cfg: TokenProviderConfig) {}

  invalidar(): void {
    this.cachedToken = null;
    this.expiresAtMs = 0;
  }

  async obtenerToken(): Promise<string> {
    const ahora = Date.now();
    if (this.cachedToken && ahora < this.expiresAtMs) {
      return this.cachedToken;
    }
    if (this.inflight) {
      return this.inflight;
    }

    this.inflight = this.solicitarNuevoToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async solicitarNuevoToken(): Promise<string> {
    const url = `${this.cfg.baseUrl}${this.cfg.tokenPath}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.error(
          `Error de autenticación contra el gateway en ${this.cfg.tokenPath}: código ${res.status}`,
        );
        throw new ServicioNoDisponible("API Gateway");
      }

      const raw = await res.json();
      const parsed = tokenResponseSchema.safeParse(raw);
      if (!parsed.success) {
        console.error("Respuesta de token del gateway no cumple el esquema esperado");
        throw new ServicioNoDisponible("API Gateway");
      }

      const ttlSeconds = Math.max(1, (parsed.data.expires_in ?? 300) - 5);
      this.cachedToken = parsed.data.access_token;
      this.expiresAtMs = Date.now() + ttlSeconds * 1000;
      return this.cachedToken;
    } catch (err) {
      if (err instanceof ServicioNoDisponible) {
        throw err;
      }
      console.error("Fallo de red al solicitar token al gateway");
      throw new ServicioNoDisponible("API Gateway");
    } finally {
      clearTimeout(timer);
    }
  }
}
