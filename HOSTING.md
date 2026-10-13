# App Web CX · despliegue independiente

Esta es la versión autónoma de la aplicación. No requiere Google Apps Script ni Railway. El frontend y la API se sirven desde el mismo contenedor y los datos operativos se almacenan en PostgreSQL.

## Requisitos

- Docker 24+ y Docker Compose v2, o un hosting que construya imágenes Docker.
- PostgreSQL 14+ si el proveedor ofrece la base por separado.
- HTTPS obligatorio para uso real.
- Un dominio o subdominio, por ejemplo `cirugia.midominio.com`.

## Despliegue con Docker Compose

1. Copie `.env.example` como `.env`.
2. Reemplace todos los secretos.
3. Genere secretos diferentes de al menos 32 caracteres. Ejemplo:

```sh
openssl rand -hex 32
openssl rand -hex 32
```

4. Defina un PIN inicial válido para el primer SUPERADMIN.
5. Levante la aplicación:

```sh
docker compose up -d --build
```

6. Compruebe:

```sh
curl http://localhost:3000/health
```

La respuesta debe incluir `"ok":true`, `"dataMode":"PRODUCTION"` y el esquema configurado.

## Despliegue en un hosting Docker

El repositorio tiene un `Dockerfile` en la raíz. Configure:

- Puerto interno: `3000`.
- Healthcheck: `/health`.
- `DATA_MODE=PRODUCTION`.
- `DATABASE_URL`: URL privada de PostgreSQL.
- `DATABASE_SSL=require` para bases administradas con TLS; use `disable` solo cuando PostgreSQL viaje por una red privada Docker/local.
- `DB_SCHEMA=qx_app`.
- `SESSION_SECRET`: secreto aleatorio de 32+ caracteres.
- `AUTH_PEPPER`: segundo secreto distinto, de 32+ caracteres.
- `BOOTSTRAP_ADMIN_USER`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PIN`: se consumen únicamente si no existe ningún usuario.
- `APP_PUBLIC_URL`: URL HTTPS pública.

El servidor crea las tablas y el esquema de forma aditiva al arrancar. No borra pacientes ni usuarios existentes durante un redeploy.

## Datos y persistencia

Los casos quirúrgicos, usuarios, roles, configuración, auditoría, movimientos, cancelaciones, seguimiento, PASP, catálogos e indicadores se almacenan en PostgreSQL. Los adjuntos se almacenan actualmente en PostgreSQL como contenido codificado, por lo que no requieren un volumen de archivos independiente.

Para producción real:

- Mantenga PostgreSQL en red privada; no publique el puerto 5432 a Internet.
- Active copias de seguridad automáticas y pruebe restauraciones.
- Conserve `SESSION_SECRET` y `AUTH_PEPPER`; cambiarlos puede invalidar sesiones y afectar la autenticación.
- Use HTTPS y un proxy inverso administrado por el proveedor o Nginx/Caddy.
- Restrinja el acceso administrativo y revise el log de auditoría.
- Para datos clínicos reales, aloje la solución en infraestructura con controles contractuales, técnicos y de respaldo adecuados para información sensible.

## Modos

`PRODUCTION`: no crea pacientes ficticios. Si la base está vacía, solo crea el rol SUPERADMIN y el primer usuario definido por las variables de bootstrap.

`SIMULATED`: crea datos ficticios para pruebas. No debe utilizarse en una instalación asistencial real.

## Base externa en lugar de Docker Compose

Si el hosting entrega PostgreSQL, despliegue solamente el contenedor web y configure una URL como:

```text
DATABASE_URL=postgresql://usuario:clave@host:5432/base
DATABASE_SSL=require
DATA_MODE=PRODUCTION
DB_SCHEMA=qx_app
```

No es necesario ejecutar migraciones manuales para el primer arranque.

## Actualización

```sh
git pull
docker compose up -d --build
```

El esquema se conserva. Realice un backup de PostgreSQL antes de actualizaciones mayores.


## Validación obligatoria antes de habilitar uso asistencial

Ejecute las verificaciones en un ambiente de pruebas aislado, sin datos identificables de pacientes y sin usar las credenciales de producción:

1. Compruebe que `DATA_MODE=PRODUCTION`, `DB_SCHEMA=qx_app` y `/health` informan el modo, esquema y versión esperados. Una base nueva **no** debe cargar pacientes ficticios.
2. Valide inicio y cierre de sesión, cambio de PIN inicial, roles, permisos y bloqueo de las rutas de seguimiento sin autenticación.
3. En la base vacía de pruebas, registre un episodio ficticio con `sourceKind=REAL` únicamente como prueba técnica interna en un sistema aislado (no se debe incorporar al servicio real); compruebe que un episodio marcado `SIMULADO` es rechazado en modo producción.
4. Revise el flujo de primera y segunda llamada, seguimiento adicional, correcciones por adenda, escalamiento a Coordinación/Seguridad del Paciente e indicadores. No registre como realizadas llamadas no efectuadas.
5. Revise que las descargas, el portal de acompañantes, los adjuntos y las consultas por roles no filtren identificadores o hallazgos clínicos sin autorización.
6. Valide en un navegador real la interfaz, diseño adaptable, formulario de pacientes, errores de red, impresión y exportaciones; las pruebas automatizadas no sustituyen esta revisión.
7. Antes del uso real, habilite HTTPS, respaldo cifrado y recuperación probada de PostgreSQL, retención y auditoría de accesos, control de secretos, rotación de claves en caso de exposición y revisión de permisos del repositorio.

**Condición de puesta en producción:** completar pruebas funcionales y de seguridad con responsables de Sistemas, Coordinación de Cirugía y Seguridad del Paciente. Un CI exitoso no constituye autorización clínica o habilitación del software. La aplicación no se ha desplegado por esta documentación.

## Comprobaciones

- `GET /health`: salud del servicio y conexión a PostgreSQL.
- `/`: aplicación.
- `/?follow=1`: portal público de acompañantes.
- La autenticación, permisos y administración de roles se realizan en la propia aplicación.

Versión de despliegue: **6.0.1 standalone**.
