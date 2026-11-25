import { z } from "zod";
const schema = z.object({
  PORT: z.coerce.number().default(3000),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\/[^/?#]+\/[^/?#]+(?:\?[^#]*)?$/, "MONGODB_URI debe incluir el nombre de la base de datos"),
  QR_SECRET: z.string().min(16),
  GATEWAY_URL: z
    .string()
    .url()
    .transform((u) => u.replace(/\/+$/, "")),
  GATEWAY_SECRET: z.string().min(1),
  GATEWAY_TOKEN_PATH: z.string().default("/token"),
  GATEWAY_TIMEOUT_MS: z.coerce.number().default(3000),
  GATEWAY_MAX_RETRIES: z.coerce.number().default(2),
  CLIENT_ID: z.string().min(1),
  CLIENT_SECRET: z.string().min(1),
  TOPE_REVENTA_PCT: z.coerce.number().default(110),
  QR_API_URL: z.string().url().default("https://quickchart.io/qr"),
  QR_API_KEY: z.string().min(1).optional(),
  QR_API_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  QR_API_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  QR_CACHE_TTL_MS: z.coerce.number().int().min(0).default(300_000),
  QR_CACHE_MAX_ITEMS: z.coerce.number().int().positive().default(500),
});
export const env = schema.parse(process.env);
