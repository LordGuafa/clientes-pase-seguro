import { z } from "zod";
const schema = z.object({
  PORT: z.coerce.number().default(3000),
  MONGODB_URI: z.string().min(1),
  QR_SECRET: z.string().min(16),
  GATEWAY_URL: z.url(),
  GATEWAY_SECRET: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  CLIENT_SECRET: z.string().min(1),
  TOPE_REVENTA_PCT: z.coerce.number().default(110),
});
export const env = schema.parse(process.env);
