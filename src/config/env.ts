import { z } from "zod";
const schema = z.object({
  PORT: z.coerce.number().default(3000),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().default("acceso_reventa"),
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
});
export const env = schema.parse(process.env);
