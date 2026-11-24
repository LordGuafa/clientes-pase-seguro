# Eventos y boletas

API CRUD de Eventos y boletas para el clúster Pase seguro.

## Responsabilidad

Este proyecto implementa exclusivamente:

- CRUD de eventos.
- Consulta de boletas.
- Cambio de propietario de una boleta.
- Creación automática de boletas.
- Cancelación de eventos.
- Datos semilla.
- Contrato OpenAPI.

El MID de Compras, las reservas temporales, la confirmación de pagos y los QR firmados están fuera de este repositorio y los implementará otra persona.

## Arquitectura

Arquitectura por capas:

```text
HTTP / FastAPI
    -> rutas
    -> servicios
    -> repositorios
    -> SQLAlchemy
    -> PostgreSQL
```

- `app/api`: rutas HTTP, validación, cabecera del gateway y manejo de respuestas.
- `app/schemas`: modelos Pydantic de entrada y salida.
- `app/services`: reglas del CRUD.
- `app/repositories`: acceso a PostgreSQL.
- `app/models`: entidades SQLAlchemy (`Evento` y `Boleta`).
- `app/core`: configuración y conexión.

Lenguajes y frameworks: **Python + FastAPI**. Usa PostgreSQL para diferenciarse de la API de Acceso y reventa.

## Instalación y ejecución

Necesitas Python y Docker con Docker Compose instalados. Ejecuta los comandos desde la carpeta del proyecto.

### Primera vez

1. Entra a la carpeta:

```bash
cd "Eventos y boletas"
```

2. Crea tu archivo local de configuración. Este comando copia los valores de ejemplo a `.env`; edita ese archivo si quieres cambiar el puerto, la contraseña u otra configuración:

```bash
cp .env.example .env
```

3. Crea e inicia PostgreSQL en Docker:

```bash
docker compose up -d
```

`-d` deja PostgreSQL ejecutándose en segundo plano. Compose crea la base `eventos_boletas` y guarda los datos en el volumen `datos_postgres`. El puerto del computador es `5433` (el contenedor usa `5432`), para evitar conflicto con otra instalación local. La variable `URL_BASE_DATOS` en `.env` debe apuntar a ese puerto.

4. Crea un entorno virtual de Python e instálale las dependencias:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test]"
```

`source .venv/bin/activate` activa el entorno virtual. Solo hace falta crear el entorno e instalar las dependencias la primera vez.

5. Inicia la API:

```bash
uvicorn app.main:app --reload --port 8001
```

Al iniciar, la aplicación crea las tablas y carga los datos semilla. Mientras Uvicorn esté ejecutándose, abre:

- Documentación interactiva: http://localhost:8001/docs
- Esquema OpenAPI: http://localhost:8001/openapi.json
- Salud de la API: http://localhost:8001/health

Para apagar la API, presiona `Ctrl+C` en la terminal donde corre Uvicorn.

### Próximas ejecuciones

Desde la carpeta del proyecto, activa el entorno e inicia los servicios:

```bash
cd "Eventos y boletas"
docker compose up -d
source .venv/bin/activate
uvicorn app.main:app --reload --port 8001
```

Para detener PostgreSQL sin borrar la base:

```bash
docker compose down
```

`docker compose down` detiene y elimina el contenedor, pero conserva la base en el volumen para la próxima ejecución. **No uses `-v` salvo que quieras borrar permanentemente los datos locales**:

```bash
docker compose down -v
```

### Revisar PostgreSQL

Comprueba que el contenedor está activo:

```bash
docker compose ps
```

Abre la consola de PostgreSQL dentro del contenedor:

```bash
docker compose exec postgres psql -U pase_seguro -d eventos_boletas
```

En `psql`, muestra las tablas y consulta algunos datos:

```sql
\dt
SELECT * FROM eventos;
SELECT estado, COUNT(*) FROM boletas GROUP BY estado;
\q
```

## Variables

- `URL_BASE_DATOS`: conexión SQLAlchemy a PostgreSQL.
- `NOMBRE_BASE_DATOS`, `USUARIO_BASE_DATOS`, `CLAVE_BASE_DATOS`: nombre de base y credenciales usadas por el contenedor. Deben corresponder con `URL_BASE_DATOS`.
- `SECRETO_GATEWAY`: cabecera `x-gateway-secret` agregada por el gateway.
- `PUERTO`: puerto local.
- `NOMBRE_APP`: nombre de la aplicación.

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/eventos` | Lista eventos con filtros y paginación |
| GET | `/eventos/{id}` | Obtiene detalle y boletas disponibles |
| POST | `/eventos` | Crea un evento y genera sus boletas |
| PUT | `/eventos/{id}` | Actualiza un evento |
| DELETE | `/eventos/{id}` | Cancela un evento |
| GET | `/boletas` | Lista boletas con filtros y paginación |
| GET | `/boletas/{codigo}` | Consulta una boleta |
| PATCH | `/boletas/{codigo}/propietario` | Cambia propietario y precio pagado |
| GET | `/health` | Salud básica |
| GET | `/health/ready` | Disponibilidad de PostgreSQL |

Las rutas CRUD exigen `x-gateway-secret`.

## Pruebas

```bash
pytest
```

La documentación OpenAPI se genera automáticamente en `/docs` y `/openapi.json`.
