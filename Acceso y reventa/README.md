# Servicio Acceso y Reventa — Clúster Pase Seguro

Microservicio del grupo **Acceso y reventa** para la plataforma de boletería anti-reventa con control de acceso por código QR firmado (**Clúster Pase Seguro**).

Construido en **Node.js + TypeScript + Express 5 + MongoDB + Zod** siguiendo **Arquitectura Hexagonal (Puertos y Adaptadores)**.

---

## 1. Módulos y Endpoints Implementados

Todas las rutas de negocio exigen la cabecera `X-Gateway-Secret` inyectada por el API Gateway del clúster (excepto `/health` y `/health/ready`).

### API CRUD — Accesos y Reventas (MongoDB)
- `GET /boletas/{codigo}/estado-acceso` (**A-HU2**, alcance `accesos:leer`):
  - Devuelve `{ boletaCodigo, ingreso, transferencias, bloqueada }`.
  - Si la boleta no tiene movimientos previos en MongoDB, responde `200 OK` con `{ ingreso: false, transferencias: 0, bloqueada: false }` (nunca `404`).

### API MID — Validación de Ingreso y Emisión Visual de QR
- `POST /accesos/validar` (alcance `boletas:leer`):
  - Verifica formato y firma HMAC-SHA256 (`QR_SECRET`), consulta boleta y evento en *Eventos y boletas* a través del Gateway (OAuth2 `client_credentials` con renovación en `401` y reintentos en `503`), impide doble uso (`409 boleta_ya_usada` con índice único parcial en MongoDB) y rechaza boletas bloqueadas (`403 boleta_bloqueada`), registrando cada intento (`aceptado` o `rechazado`).
- `GET /boletas/{codigo}/qr` (alcances `boletas:leer`, `accesos:leer`):
  - Valida que la boleta exista, esté `vendida`, no haya ingresado ni esté bloqueada, firma el código (`codigo.firma`) y consume el **API externo de QuickChart** para entregar la imagen PNG del código QR (en JSON Base64 o binario `image/png` con `?formato=png`).

### Monitoreo
- `GET /health`: Liveness probe (`200 OK`).
- `GET /health/ready`: Readiness probe contra MongoDB (`200 OK` o `503`).

---

## 2. Ficha del API de Tercero (Generación de Códigos QR)

| Campo | Detalle |
| --- | --- |
| **Nombre del proveedor** | **QuickChart — QR Code API** |
| **Documentación oficial** | [https://quickchart.io/documentation/qr-codes/](https://quickchart.io/documentation/qr-codes/) |
| **Endpoint base** | `https://quickchart.io/qr` (configurable vía `QR_API_URL`) |
| **Qué hace y por qué se eligió** | Genera imágenes de códigos QR en formato `PNG` o `SVG` mediante peticiones HTTP sin estado, con control de corrección de errores (`ecLevel=M`), margen y dimensiones. Se eligió porque encaja directamente con la temática de boletería con acceso por QR, no requiere SDK propietario, ofrece baja latencia y cuenta con nivel gratuito público bien documentado. |
| **Límites y condiciones de uso** | Nivel gratuito: hasta **60 peticiones por minuto por IP** sin registro. Se identifica la aplicación mediante cabecera `User-Agent: PaseSeguro-AccesoReventa/1.0` y se mitiga el consumo con caché en memoria con TTL (`QR_CACHE_TTL_MS`, 5 min por defecto) y *single-flight* para peticiones concurrentes. |
| **Costo** | `$0 USD` en el plan gratuito comunitario (suficiente para desarrollo y demostración). |
| **Autenticación** | No obligatoria en el plan gratuito; soporta llave opcional mediante cabecera `X-QuickChart-Key` configurada en la variable segura `QR_API_KEY` (nunca expuesta en código ni logs). |
| **Protección y Plan de Degradación** | Timeout estricto con `AbortController` (`QR_API_TIMEOUT_MS=3000`), reintentos limitados (`QR_API_MAX_RETRIES=2`) ante errores `5xx`, `429` o red, y validación de firma binaria PNG. **Si QuickChart falla tras los reintentos:** en modo JSON el MID responde `200 OK` marcando explícitamente `degradado: true` e `imagenBase64: null`, entregando aun así el `codigoQr` firmado (`codigo.firma`) para no detener la operación ni la validación en puerta; si el cliente exige binario directo (`?formato=png`), responde `503 proveedor_qr_no_disponible`. En ambos casos los mensajes internos y llaves del proveedor nunca se filtran. |

---

## 3. Dependencias Principales

- `express` (`^5.3.0`): Servidor HTTP y enrutamiento modular.
- `mongodb` (`^7.9.0`): Driver oficial para la base de datos documental (`accesos` y `reventas`).
- `zod` (`^4.6.7`): Validación estricta de variables de entorno, parámetros de entrada y respuestas externas.
- `vitest` y `supertest`: Pruebas unitarias y de integración con mocks HTTP locales (sin depender de internet).
- `@redocly/cli`: Linter de contratos OpenAPI 3.0.3 (`openapi/*.yaml`).

---

## 4. Variables de Entorno

Copia `.env.example` a `.env` y completa los valores:

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto HTTP del servicio (por defecto `3000`) |
| `MONGODB_URI` | Cadena de conexión a MongoDB / Cosmos DB |
| `MONGO_TEST_URI` | URI de integración; debe incluir la base `pase-seguro-test`. La base del servicio se especifica en `MONGODB_URI`. |
| `QR_SECRET` | Secreto compartido (mín. 16 caracteres) para firmar/verificar HMAC-SHA256 |
| `GATEWAY_URL` | URL base del API Gateway del clúster |
| `GATEWAY_SECRET` | Secreto compartido en la cabecera `X-Gateway-Secret` |
| `GATEWAY_TOKEN_PATH` | Ruta OAuth2 de emisión de tokens (por defecto `/token`) |
| `GATEWAY_TIMEOUT_MS` / `GATEWAY_MAX_RETRIES` | Timeout (ms) y reintentos máximos hacia el Gateway |
| `CLIENT_ID` / `CLIENT_SECRET` | Credenciales OAuth2 `client_credentials` del servicio |
| `TOPE_REVENTA_PCT` | Porcentaje máximo permitido sobre el precio base (por defecto `110`) |
| `QR_API_URL` | URL del API externo de QR (`https://quickchart.io/qr`) |
| `QR_API_KEY` | Llave opcional del proveedor de QR |
| `QR_API_TIMEOUT_MS` / `QR_API_MAX_RETRIES` | Timeout (ms) y reintentos hacia el API externo de QR |
| `QR_CACHE_TTL_MS` / `QR_CACHE_MAX_ITEMS` | TTL en milisegundos y capacidad máxima de la caché de imágenes QR |

---

## 5. Ejecución y Pruebas

```bash
# Instalar dependencias (usa pnpm vía Corepack)
corepack pnpm install

# Ejecutar suite de pruebas unitarias y de integración
corepack pnpm test

# Validar contratos OpenAPI 3.0.3
corepack pnpm lint:openapi

# Analizar código y compilar TypeScript
corepack pnpm lint
corepack pnpm build

# Levantar en modo desarrollo
corepack pnpm dev
```
