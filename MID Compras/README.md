# MID Compras

API Python 3.12 y FastAPI del grupo Eventos y boletas. Reserva y confirma boletas de Pase Seguro. Comparte los modelos y la base PostgreSQL del grupo para que el CRUD vea la reserva, la venta y el propietario sin duplicar inventario.

## Papel de Ticketmaster

La flecha «MID Compras → API de tercero (Eventos)» indica un consumo externo. El enunciado general §6 deja al grupo elegir la API, y las reglas de compras del clúster §4.2 operan sobre boletas de Pase Seguro. La integración usa [Ticketmaster Discovery](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) para consultar datos de los eventos que el grupo vincule explícitamente y devolver su nombre y URL en la reserva. El estado, aforo y precio del evento local determinan si se puede reservar. La confirmación registra la referencia de pago recibida y emite los QR de Pase Seguro.

- Configura `TICKETMASTER_API_KEY` y `TICKETMASTER_EVENTOS`, por ejemplo `{"evt-1":"ID_DE_DISCOVERY"}`. Usa un ID obtenido de Discovery para el evento equivalente.
- Discovery usa una espera de 2 s por operación HTTP, con hasta un reintento por error de red, timeout o 5xx. Las respuestas se guardan en memoria 5 minutos y, ante un fallo, se reutilizan marcadas con `desactualizado: true` o se devuelve `ticketmaster: null`. El fallo se cachea 30 segundos. Un evento sin vínculo devuelve `ticketmaster: null`.
- Las operaciones comerciales de Ticketmaster pertenecen a su [Partner API](https://developer.ticketmaster.com/products-and-docs/apis/partner/), de acceso restringido.

## Ejecución local

Arranca primero Eventos y boletas para inicializar y sembrar su base, según su README. Desde esta carpeta, en PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
# Completa las variables de .env antes de iniciar
.\.venv\Scripts\python.exe -m uvicorn mid_compras.main:app --port 8002
```

Usa la misma `URL_BASE_DATOS` que Eventos y boletas y el mismo `QR_SECRET` que Acceso y reventa. `SECRETO_GATEWAY` corresponde a la cabecera que inyecta el gateway al llamar al MID. Las credenciales `CLIENT_ID` y `CLIENT_SECRET` de Compras tienen el alcance `accesos:leer`. El MID obtiene el token con Client Credentials y lo renueva una vez si el gateway responde 401.

Configura el gateway para que envíe `/compras/*` al MID en el puerto 8002. Envía `GET /boletas/{codigo}/estado-acceso` a Acceso y reventa, antes de la regla general de `/boletas`. Si falla esa consulta, el MID responde 503 y revierte la reserva. Los alcances de entrada de `/compras` se acuerdan en el gateway.

## Contrato y pruebas

El [contrato OpenAPI](openapi.json) también se publica en `/openapi.json`, con documentación interactiva en `/docs`.

| Operación | Resultado |
| --- | --- |
| `POST /compras/reservar` | 201 con `id`, códigos reservados, total, `venceEn` en UTC y metadata opcional de Discovery. |
| `POST /compras/{id}/confirmar` | 200 con boletas vendidas y `codigoQr`. Repetir la confirmación devuelve la compra original. |
| `GET /health` | 200 sin cabecera del gateway. |

El QR usa `UUID.HMAC-SHA256-en-Base64`, compatible con Acceso y reventa. Las reservas vencidas se liberan al confirmar o al intentar reservar en el mismo evento, y una tarea periódica también las recoge cada cinco segundos.

Ejecuta `python -m pytest tests -q` con pytest en el entorno virtual. La prueba usa SQLite temporal y simula el gateway y Ticketmaster. Para probar el flujo completo, usa un evento activo con fecha de hoy en Bogotá, compra una boleta y envía su `codigoQr` a `POST /accesos/validar` por el gateway.
