import type {
  QrImageGenerator,
  QrImageResult,
} from "../../../application/ports/out/qr-image-generator.ts";

export interface QuickChartQrClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxItems?: number;
  clock?: { ahora(): Date };
  sleep?: (ms: number) => Promise<void>;
}

interface CacheEntry {
  imagenBase64: string;
  expiraEn: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const USER_AGENT =
  "PaseSeguro-AccesoReventa/1.0 (+https://github.com/LordGuafa/clientes-pase-seguro)";

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function esPngValido(buf: Buffer): boolean {
  if (buf.length < PNG_SIGNATURE.length) return false;
  return buf.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

export class QuickChartQrClient implements QrImageGenerator {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<QrImageResult>>();
  private readonly clock: { ahora(): Date };
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxItems: number;

  constructor(private readonly cfg: QuickChartQrClientConfig) {
    this.clock = cfg.clock ?? { ahora: () => new Date() };
    this.sleep = cfg.sleep ?? defaultSleep;
    this.maxItems = cfg.cacheMaxItems ?? 500;
  }

  async generarImagenQr(contenidoQr: string, tamanoPx = 300): Promise<QrImageResult> {
    const size = Math.min(1000, Math.max(100, Math.trunc(tamanoPx)));
    const cacheKey = `${size}:${contenidoQr}`;
    const ahoraMs = this.clock.ahora().getTime();

    if (this.cfg.cacheTtlMs > 0) {
      const hit = this.cache.get(cacheKey);
      if (hit && ahoraMs < hit.expiraEn) {
        // Refresca orden LRU en Map
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, hit);
        return {
          formato: "image/png",
          imagenBase64: hit.imagenBase64,
          origenCache: true,
          degradado: false,
        };
      }
      if (hit) {
        this.cache.delete(cacheKey);
      }
    }

    const pendiente = this.inflight.get(cacheKey);
    if (pendiente) {
      return pendiente;
    }

    const promesa = this.solicitarAlProveedor(contenidoQr, size, cacheKey).finally(() => {
      this.inflight.delete(cacheKey);
    });
    this.inflight.set(cacheKey, promesa);
    return promesa;
  }

  private guardarEnCache(key: string, imagenBase64: string): void {
    if (this.cfg.cacheTtlMs <= 0) return;
    if (this.cache.size >= this.maxItems) {
      const masAntigua = this.cache.keys().next().value;
      if (masAntigua !== undefined) {
        this.cache.delete(masAntigua);
      }
    }
    this.cache.set(key, {
      imagenBase64,
      expiraEn: this.clock.ahora().getTime() + this.cfg.cacheTtlMs,
    });
  }

  private async solicitarAlProveedor(
    contenidoQr: string,
    size: number,
    cacheKey: string,
  ): Promise<QrImageResult> {
    const url = new URL(this.cfg.baseUrl);
    url.searchParams.set("text", contenidoQr);
    url.searchParams.set("format", "png");
    url.searchParams.set("size", String(size));
    url.searchParams.set("ecLevel", "M");
    url.searchParams.set("margin", "2");

    const headers: Record<string, string> = {
      Accept: "image/png",
      "User-Agent": USER_AGENT,
    };
    if (this.cfg.apiKey) {
      headers["X-QuickChart-Key"] = this.cfg.apiKey;
    }

    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

      try {
        const res = await fetch(url.toString(), {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        if (res.status === 429 || res.status >= 500) {
          if (attempt < this.cfg.maxRetries) {
            attempt++;
            await this.sleep(150 * attempt);
            continue;
          }
          console.error(
            `Proveedor externo de QR no disponible tras ${attempt + 1} intentos (HTTP ${res.status})`,
          );
          return this.respuestaDegradada();
        }

        if (!res.ok) {
          console.error(`Proveedor externo de QR rechazó la solicitud (HTTP ${res.status})`);
          return this.respuestaDegradada();
        }

        const contentType = res.headers.get("content-type") ?? "";
        const bytes = Buffer.from(await res.arrayBuffer());
        if (!contentType.toLowerCase().includes("image/png") || !esPngValido(bytes)) {
          console.error("Proveedor externo de QR devolvió un contenido que no es PNG válido");
          return this.respuestaDegradada();
        }

        const imagenBase64 = bytes.toString("base64");
        this.guardarEnCache(cacheKey, imagenBase64);

        return {
          formato: "image/png",
          imagenBase64,
          origenCache: false,
          degradado: false,
        };
      } catch {
        if (attempt < this.cfg.maxRetries) {
          attempt++;
          await this.sleep(150 * attempt);
          continue;
        }
        console.error(
          `Fallo de red o timeout al consultar el proveedor externo de QR tras ${attempt + 1} intentos`,
        );
        return this.respuestaDegradada();
      } finally {
        clearTimeout(timer);
      }
    }
  }

  private respuestaDegradada(): QrImageResult {
    return {
      formato: "image/png",
      imagenBase64: null,
      origenCache: false,
      degradado: true,
      motivoDegradacion: "proveedor_qr_no_disponible",
    };
  }
}
