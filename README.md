# APP WEB CX · Cirugía y seguimiento postoperatorio

Versión principal: **6.0.1 standalone** (correcciones de compatibilidad de producción y PASP).

La aplicación funciona como sistema web independiente con frontend, API y PostgreSQL. No requiere Google Apps Script para operar y no depende de un proveedor de hosting específico.

## Despliegue

La raíz del repositorio contiene:

- `Dockerfile`: imagen lista para producción.
- `docker-compose.yml`: aplicación + PostgreSQL.
- `.env.example`: variables requeridas.
- `HOSTING.md`: guía completa para VPS y hosting Docker.
- `railway/`: código fuente principal de la aplicación; el nombre de la carpeta se conserva por compatibilidad histórica, pero el código ya no depende de Railway.

Para iniciar en un servidor con Docker:

```sh
cp .env.example .env
# Edite .env y configure secretos reales.
docker compose up -d --build
```

Healthcheck:

```text
GET /health
```

## Correcciones 6.0.1

- La configuración general y PASP usan el esquema indicado por `DB_SCHEMA` en PostgreSQL, sin escribir en un esquema de simulación ajeno.
- PASP admite registros identificados como `REAL` únicamente en `DATA_MODE=PRODUCTION`; el entorno `SIMULATED` conserva `SIMULADO`.
- Formularios, reportes de productividad, indicadores y exportaciones identifican el origen de datos.
- La lectura del esquema de trabajo PASP requiere sesión autenticada y permisos correspondientes.
- Se verifica el modo de producción mediante una prueba aislada con PostgreSQL en memoria. La suite automatizada no sustituye la validación manual en un hosting real.

**Importante:** el pull request se mantiene en revisión hasta completar las pruebas de aceptación y seguridad del paciente. No cargue información clínica real en ambientes de prueba ni en el repositorio.

## Modo de producción

Use:

```text
DATA_MODE=PRODUCTION
DB_SCHEMA=qx_app
```

En este modo no se crean pacientes ficticios. Si PostgreSQL está vacío, se inicializa el rol `SUPERADMIN` y el primer administrador usando las variables `BOOTSTRAP_ADMIN_*`.

El modo `SIMULATED` permanece disponible exclusivamente para pruebas.

## Funciones principales

La aplicación incluye operación quirúrgica con QNO configurables, jefe de turno y movimientos; programación y carga masiva con lector PDF editable; cancelaciones; tiempos intraoperatorios y profilaxis; recuperación, alta y hospitalización; portal de acompañantes con token y mensajes configurables; cuidados POP y PASP; KPI/MCI; descargas; productividad; administración de usuarios, roles y permisos; configuración operativa; trazabilidad y auditoría.

Los adjuntos se almacenan en PostgreSQL y no requieren un volumen de archivos independiente.

## Seguridad de despliegue

No guarde contraseñas, PIN, `SESSION_SECRET`, `AUTH_PEPPER` ni cadenas `DATABASE_URL` reales en Git. Utilice variables privadas del hosting.

Para uso con información clínica real, mantenga PostgreSQL en red privada, publique únicamente HTTPS, habilite copias de seguridad automáticas y preserve los secretos de autenticación entre despliegues.

## Código histórico de Apps Script

Los archivos `.gs`, `Index.html`, `appsscript.json` y `APPS_SCRIPT_INSTALL.md` de la raíz se conservan como referencia de una variante anterior. **No forman parte del despliegue standalone 6.0.0.**

El código que debe desplegarse está empaquetado por el `Dockerfile` de la raíz.

## Validación

Las pruebas automatizadas se ejecutan con Bun desde `railway/tests/`. El workflow de GitHub Actions continúa validando la aplicación en cada cambio de `main`.

Consulte **[HOSTING.md](HOSTING.md)** para instalación, variables, actualizaciones y recomendaciones de respaldo.
