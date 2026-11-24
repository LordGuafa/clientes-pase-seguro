import { ServicioNoDisponible } from "../../../domain/errors.ts";
import type { TokenProvider } from "./token-provider.ts";

type FetchFn = typeof fetch;

export class GatewayHttpClient {
  private readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: FetchFn;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: {
    baseUrl: string;
    tokenProvider: TokenProvider;
    timeoutMs: number;
    maxRetries: number;
    fetch?: FetchFn;
    sleep?: (ms: number) => Promise<void>;
  }) {
    this.baseUrl = opts.baseUrl;
    this.tokenProvider = opts.tokenProvider;
    this.timeoutMs = opts.timeoutMs;
    this.maxRetries = opts.maxRetries;
    this.fetchFn = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async getJson(
    path: string,
    servicio: string,
  ): Promise<{ status: 200; body: unknown } | { status: 404 }> {
    let refreshedAfter401 = false;
    let transientRetries = 0;

    while (true) {
      const token = await this.tokenProvider.obtener();
      let res: Response;
      try {
        res = await this.fetchFn(`${this.baseUrl}${path}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        if (transientRetries < this.maxRetries) {
          await this.sleep(this.backoffMs(transientRetries));
          transientRetries++;
          continue;
        }
        throw new ServicioNoDisponible(servicio);
      }

      if (res.status === 200) {
        try {
          const body = (await res.json()) as unknown;
          return { status: 200, body };
        } catch {
          console.error("Respuesta ilegible del gateway", { metodo: "GET", ruta: path, status: res.status });
          throw new ServicioNoDisponible(servicio);
        }
      }

      if (res.status === 404) {
        return { status: 404 };
      }

      if (res.status === 401) {
        if (!refreshedAfter401) {
          this.tokenProvider.invalidar();
          refreshedAfter401 = true;
          continue;
        }
        console.error("Credenciales rechazadas por el gateway");
        throw new ServicioNoDisponible(servicio);
      }

      if (res.status === 403) {
        console.error("Permisos insuficientes en el gateway (revisar alcances)");
        throw new ServicioNoDisponible(servicio);
      }

      if (res.status === 502 || res.status === 503 || res.status === 504) {
        if (transientRetries < this.maxRetries) {
          await this.sleep(this.backoffMs(transientRetries));
          transientRetries++;
          continue;
        }
        throw new ServicioNoDisponible(servicio);
      }

      console.error("Respuesta inesperada del gateway", { metodo: "GET", ruta: path, status: res.status });
      throw new ServicioNoDisponible(servicio);
    }
  }

  private backoffMs(attempt: number): number {
    return attempt === 0 ? 200 : 400;
  }
}
