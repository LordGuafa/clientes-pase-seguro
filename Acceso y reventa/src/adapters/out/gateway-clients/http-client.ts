import { ServicioNoDisponible } from "../../../domain/errors.ts";
import type { TokenProvider } from "./token-provider.ts";

export interface GatewayHttpClientConfig {
  baseUrl: string;
  tokenProvider: TokenProvider;
  timeoutMs: number;
  maxRetries: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface GatewayHttpResponse {
  status: number;
  body: unknown;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class GatewayHttpClient {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly cfg: GatewayHttpClientConfig) {
    this.sleep = cfg.sleep ?? defaultSleep;
  }

  async get(path: string): Promise<GatewayHttpResponse> {
    return this.request("GET", path);
  }

  async request(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    payload?: unknown,
  ): Promise<GatewayHttpResponse> {
    let token = await this.cfg.tokenProvider.obtenerToken();
    let retried401 = false;
    let attempt = 0;

    while (true) {
      let res: Response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        };
        if (payload !== undefined) {
          headers["Content-Type"] = "application/json";
        }

        res = await fetch(`${this.cfg.baseUrl}${path}`, {
          method,
          headers,
          body: payload !== undefined ? JSON.stringify(payload) : undefined,
          signal: controller.signal,
        });
      } catch {
        clearTimeout(timer);
        if (attempt < this.cfg.maxRetries) {
          attempt++;
          await this.sleep(100 * attempt);
          continue;
        }
        throw new ServicioNoDisponible("Servicio vecino");
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 401) {
        if (!retried401) {
          retried401 = true;
          this.cfg.tokenProvider.invalidar();
          token = await this.cfg.tokenProvider.obtenerToken();
          continue;
        }
        console.error(`Credenciales rechazadas tras renovar token en ${method} ${path} (401)`);
        throw new ServicioNoDisponible("API Gateway");
      }

      if (res.status === 403) {
        console.error(`Permiso insuficiente en el gateway para ${method} ${path} (403)`);
        throw new ServicioNoDisponible("API Gateway");
      }

      if (res.status === 404) {
        return { status: 404, body: null };
      }

      if (res.status >= 500) {
        if (attempt < this.cfg.maxRetries) {
          attempt++;
          await this.sleep(100 * attempt);
          continue;
        }
        throw new ServicioNoDisponible("Servicio vecino");
      }

      let body: unknown = null;
      const text = await res.text();
      if (text.length > 0) {
        try {
          body = JSON.parse(text);
        } catch {
          console.error(`Respuesta no JSON desde ${method} ${path}`);
          throw new ServicioNoDisponible("Servicio vecino");
        }
      }

      return { status: res.status, body };
    }
  }
}
