# Despliegue desde GitHub

El servicio existente `app-web-cx-`, entorno `production`, publica `main` desde
`railway/`. El contenedor, los módulos, el esquema, las semillas ficticias y las
pruebas están en este repositorio. No hay datos de pacientes ni credenciales.

Railway detecta `railway/Dockerfile`. La conexión existente con GitHub genera un
despliegue por cada actualización de `main`. `/health` verifica la conexión y
la inicialización del catálogo antes de considerar el despliegue saludable.

`.railway/railway.ts` describe la configuración usando la Infraestructura como
Código actual de Railway. El parcial administra solo el servicio web, sin
administrar ni eliminar Postgres o `db-bootstrap`. Los valores `preserve()`
siguen almacenados privadamente en Railway.

Para revisar futuros cambios de infraestructura, instale el SDK `railway` y la
CLI actual, enlace el proyecto/entorno existente y ejecute `railway config plan`.
Revise ese plan antes de `railway config apply`. El archivo de infraestructura
no se ejecuta al arrancar la aplicación. La configuración inicial se aplica
con el conector al servicio existente; la publicación del código usa la
integración nativa de GitHub.

Referencia: https://docs.railway.com/infrastructure-as-code
