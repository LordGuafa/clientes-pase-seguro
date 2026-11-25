# clientes-pase-seguro

## Docker

Requisitos: Docker Desktop (o Docker Engine con el plugin `compose`).

```bash
cp .env.example .env        # y llenar QR_SECRET, GATEWAY_URL, GATEWAY_SECRET, CLIENT_ID, CLIENT_SECRET
docker compose up --build   # levanta MongoDB y el servicio en http://localhost:3000
docker compose down         # apaga (los datos de Mongo quedan en el volumen datos_mongo)
docker compose down -v      # apaga y borra también los datos
```

- `Dockerfile`: imagen en dos etapas. La primera compila TypeScript; la segunda solo lleva `dist/` y las dependencias de producción, corre con el usuario `node` y tiene `HEALTHCHECK` sobre `/health`.
- `compose.yaml`: MongoDB 7 con volumen persistente y el servicio, que espera a que Mongo esté sano antes de arrancar.
- Solo la imagen, sin compose: `docker build -t acceso-reventa .` y `docker run --env-file .env -p 3000:3000 acceso-reventa`.

## Integración con el gateway

**Entrada (gateway → este servicio).** Toda petición, excepto `/health` y `/health/ready`, debe traer la cabecera `X-Gateway-Secret` con el valor de `GATEWAY_SECRET`. Sin ella el servicio responde `403 no_gateway`, así nadie puede saltarse la seguridad del gateway llamando la URL directa.

Rutas que el gateway debe enrutar a este servicio:

| Ruta | Método | Alcance sugerido |
| --- | --- | --- |
| `/accesos` | GET, POST | `accesos:leer`, `accesos:escribir` |
| `/accesos/validar` | POST | `accesos:validar` |
| `/reventas` | GET | `reventas:leer` |
| `/boletas/{codigo}/estado-acceso` | GET | `accesos:leer` |

Ojo: `/boletas/{codigo}/estado-acceso` es de este servicio, pero el resto de `/boletas` es de Eventos y boletas. En el gateway esta regla debe ir **antes** que la de `/boletas`.

**Salida (este servicio → gateway).** El servicio pide su token en `GATEWAY_URL + GATEWAY_TOKEN_PATH` con `CLIENT_ID` y `CLIENT_SECRET` (Client Credentials), lo guarda hasta 30 s antes de que venza y lo renueva una vez si recibe 401. Necesita los alcances `boletas:leer` y `boletas:escribir` para consultar y transferir boletas en Eventos y boletas.