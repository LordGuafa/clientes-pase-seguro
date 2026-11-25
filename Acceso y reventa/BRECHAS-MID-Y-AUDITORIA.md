# Acceso y reventa: consumo del CRUD y auditoría de ingresos rechazados

**Estado:** consumo de ambos CRUD implementado y verificado con gateway de prueba. Sigue abierta la recuperación duradera del registro cuando falla la escritura de un rechazo.

## 1. El MID consume ambos CRUD por API

**Requisito.** La sección 2 de `X1.proyecto_final.md` exige que el MID consuma al menos dos APIs CRUD, una de otro grupo. La sección 4 establece que las llamadas entre servicios pasan por el gateway.

| Dato que necesita el MID | Cómo lo obtiene hoy |
| --- | --- |
| Boleta y evento | Llama al CRUD de Eventos y boletas mediante `BoletasGatewayHttp`. Son dos recursos de la misma API. |
| Ingreso previo, transferencias y bloqueo | `AccesosGatewayHttp` consulta `GET /boletas/{codigo}/estado-acceso`. |
| Puerta y hora del primer ingreso | `GET /accesos?boletaCodigo=…&resultado=aceptado&tamano=1`. El índice del CRUD permite un único aceptado por boleta. |
| Registro de intentos | `POST /accesos`; el CRUD asigna identificador y hora. Si hay dos escaneos concurrentes, `409 acceso_duplicado` se traduce en `boleta_ya_usada` con el detalle del primer ingreso. |

**Evidencia.** En [`src/composition-root.ts`](src/composition-root.ts), los dos casos de uso del MID reciben clientes del gateway. Los repositorios Mongo quedan en los casos de uso del CRUD. La [prueba de integración](test/integration/arquitectura-comunicacion.test.ts) verifica las llamadas autenticadas a ambos CRUD, el doble ingreso y la respuesta 503 cuando no se puede leer el estado.

## 2. Un rechazo puede perderse si MongoDB no permite registrarlo

**Requisito.** A-HU1, sección 5.1 de `X1.cluster-pase-seguro.md`, pide registrar cada intento de ingreso con puerta, hora y motivo del rechazo. La sección 5.2 exige registrar un QR inválido y responder `400`.

**Caso concreto:** llega un QR con firma inválida y falla la escritura del rechazo.

1. [`ValidarIngreso.rechazar()`](src/application/use-cases/validar-ingreso.ts) intenta guardar el acceso con `resultado: "rechazado"` y `motivo: "qr_invalido"`.
2. Si `POST /accesos` no confirma el registro, el MID escribe en consola «No se pudo registrar el rechazo» y conserva el error de negocio original.
3. La puerta recibe `400 qr_invalido`. Si Mongo no persistió el documento, el intento no aparece en `GET /accesos`; no hay un mecanismo de recuperación en ese flujo. El fallo afecta a la **trazabilidad**: la boleta no obtiene acceso.

La [prueba unitaria de `ValidarIngreso`](test/unit/application/validar-ingreso.test.ts) reproduce esta situación en «Fallo al guardar un rechazo»: espera que se conserve el error original. Por eso puede pasar aunque falte el registro. El mismo archivo distingue el fallo al guardar un **aceptado**: ese error se propaga y el MID no confirma el ingreso.

**Propuesta de cierre.** Para conservar el intento durante una caída de Mongo, asignarle un identificador estable y guardar el evento en un medio duradero independiente antes de dar por completada su auditoría. Al recuperarse Mongo, reproducir el evento con ese mismo identificador, puerta, hora original y motivo. La escritura debe ser idempotente: si Mongo escribió el documento pero se perdió la confirmación, el reintento no debe duplicarlo. Si tampoco se puede conservar el evento en el medio alternativo, denegar el ingreso, señalar la indisponibilidad y generar una alerta. Un `503` por sí solo no recupera el intento.

**Cómo comprobar el cierre.** En un entorno de pruebas, simular el fallo de escritura, presentar un QR inválido y verificar que no se autoriza la entrada. Restablecer Mongo, ejecutar la recuperación dos veces y consultar `GET /accesos`: debe aparecer **exactamente un rechazo** con los datos del intento original.
