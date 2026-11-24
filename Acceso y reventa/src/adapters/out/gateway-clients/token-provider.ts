import { ServicioNoDisponible } from "../../../domain/errors.ts";

type FetchFn = typeof fetch;

// SUPUESTO: confirmar con el líder del gateway
function construirBodyToken(clientId: string, clientSecret: string): string {
  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  return params.toString();
}

// SUPUESTO: confirmar con el líder del gateway
function parsearRespuestaToken(body: unknown): { accessToken: string; expiresInSec?: number } {
  if (!body || typeof body !== "object") {
    throw new Error("cuerpo inválido");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.access_token !== "string" || b.access_token.length === 0) {
    throw new Error("access_token inválido");
  }
  const expiresInSec =
    typeof b.expires_in === "number" && Number.isFinite(b.expires_in)
      ? b.expires_in
      : undefined;
  return { accessToken: b.access_token, expiresInSec };
}

function decodificarExpJwt(token: string): number | undefined {
  const partes = token.split(".");
  if (partes.length < 2) return undefined;
  try {
    const payload = Buffer.from(partes[1], "base64url").toString("utf8");
    const obj = JSON.parse(payload) as { exp?: unknown };
    if (typeof obj.exp === "number" && Number.isFinite(obj.exp)) {
      return obj.exp;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export class TokenProvider {
  private readonly baseUrl: string;
  private readonly tokenPath: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: FetchFn;
  private readonly now: () => number;

  private cachedToken: string | null = null;
  private expiresAtMs = 0;
  private inflight: Promise<string> | null = null;

  constructor(opts: {
    baseUrl: string;
    tokenPath: string;
    clientId: string;
    clientSecret: string;
    timeoutMs: number;
    fetch?: FetchFn;
    now?: () => number;
  }) {
    this.baseUrl = opts.baseUrl;
    this.tokenPath = opts.tokenPath;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.timeoutMs = opts.timeoutMs;
    this.fetchFn = opts.fetch ?? fetch;
    this.now = opts.now ?? (() => Date.now());
  }

  invalidar(): void {
    this.cachedToken = null;
    this.expiresAtMs = 0;
  }

  async obtener(): Promise<string> {
    const ahora = this.now();
    if (this.cachedToken && ahora < this.expiresAtMs) {
      return this.cachedToken;
    }
    if (this.inflight) {
      return this.inflight;
    }
    this.inflight = this.solicitarToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async solicitarToken(): Promise<string> {
    const url = `${this.baseUrl}${this.tokenPath}`;
    try {
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construirBodyToken(this.clientId, this.clientSecret),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 401 || res.status === 403) {
        console.error("Error al obtener token del gateway", { status: res.status });
        throw new ServicioNoDisponible("Gateway");
      }
      if (!res.ok) {
        console.error("Error al obtener token del gateway", { status: res.status });
        throw new ServicioNoDisponible("Gateway");
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        console.error("Error al obtener token del gateway", { causa: "json_invalido" });
        throw new ServicioNoDisponible("Gateway");
      }

      let parsed: { accessToken: string; expiresInSec?: number };
      try {
        parsed = parsearRespuestaToken(body);
      } catch {
        console.error("Error al obtener token del gateway", { causa: "cuerpo_invalido" });
        throw new ServicioNoDisponible("Gateway");
      }

      const ahora = this.now();
      let expiresInSec = parsed.expiresInSec;
      if (expiresInSec == null) {
        const exp = decodificarExpJwt(parsed.accessToken);
        if (exp != null) {
          expiresInSec = exp - Math.floor(ahora / 1000);
        } else {
          expiresInSec = 60;
        }
      }
      this.cachedToken = parsed.accessToken;
      this.expiresAtMs = ahora + Math.max(0, expiresInSec - 30) * 1000;
      return parsed.accessToken;
    } catch (e) {
      if (e instanceof ServicioNoDisponible) {
        throw e;
      }
      const causa = e instanceof Error ? e.message : "error_desconocido";
      console.error("Error al obtener token del gateway", { causa });
      throw new ServicioNoDisponible("Gateway");
    }
  }
}
