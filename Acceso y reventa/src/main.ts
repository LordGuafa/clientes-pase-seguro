import { env } from "./config/env.ts";
import { conectarMongo, cerrarMongo } from "./adapters/out/mongo/client.ts";
import { crearIndices } from "./adapters/out/mongo/indexes.ts";
import { componer } from "./composition-root.ts";

async function main() {
  const db = await conectarMongo(env.MONGODB_URI, env.MONGODB_DB);
  await crearIndices(db);
  console.log("Conexión a MongoDB establecida e índices listos.");

  const app = componer(db, {
    qrSecret: env.QR_SECRET,
    gatewayUrl: env.GATEWAY_URL,
    tokenPath: env.GATEWAY_TOKEN_PATH,
    clientId: env.CLIENT_ID,
    clientSecret: env.CLIENT_SECRET,
    timeoutMs: env.GATEWAY_TIMEOUT_MS,
    maxRetries: env.GATEWAY_MAX_RETRIES,
  });
  const server = app.listen(env.PORT, () => {
    console.log(`Servicio escuchando en el puerto ${env.PORT}`);
  });

  const apagar = () => {
    console.log("Apagando el servicio...");
    // Primero deja de aceptar peticiones, luego cierra Mongo
    server.close(async () => {
      await cerrarMongo();
      process.exit(0);
    });
  };

  process.on("SIGTERM", apagar);
  process.on("SIGINT", apagar);
}

main().catch((error) => {
  console.error("Error al arrancar el servicio:", error);
  process.exit(1);
});
