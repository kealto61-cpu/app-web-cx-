# Railway · 5.9.1-pasp

El servicio existente publica este directorio desde GitHub `main`, con `Dockerfile`, Bun 1.3.6 y PostgreSQL. No necesita Apps Script ni una conexión a Google Drive.

## Variables privadas

Configure en Railway, sin guardarlas en Git:

- `DATABASE_URL`: conexión privada a PostgreSQL.
- `DATA_MODE=SIMULATED`: modo obligatorio en esta entrega.
- `DEMO_ADMIN_PIN`: PIN alfanumérico de 4 a 16 caracteres para la cuenta ficticia `demo` en su primera inicialización. El código valida el PIN y almacena su hash; no lo muestra en registros.
- `PORT`: Railway lo proporciona al contenedor.

`qx_simulation` se crea de forma aditiva. Al iniciar se conservan los registros y ediciones ya existentes en ese esquema. Se inicializan seis pacientes claramente ficticios, la cuenta `demo`, un catálogo educativo y series MCI simuladas. Las llamadas PASP se crean desde la página. No se leen tablas de pacientes reales ni se importan datos históricos.

La cuenta se conserva entre despliegues: cambiar `DEMO_ADMIN_PIN` no reemplaza un PIN que ya fue cambiado dentro de la aplicación.

## Ejecución local

```sh
bun install --frozen-lockfile
bun test
bun run server.ts
```

La ejecución normal necesita las variables anteriores y PostgreSQL. `tests/preview-server.ts` es una alternativa local con PostgreSQL en memoria y datos ficticios; no forma parte del contenedor publicado.

El contenedor instala únicamente dependencias de ejecución. Las pruebas usan PGlite para verificar transacciones, permisos, fichas por llamada, idempotencia, adendas, programación, configuración e indicadores.

## Publicación

El servicio web existente usa raíz `/railway`, `Dockerfile`, inicio `bun run server.ts` y comprobación `/health`. La integración nativa con GitHub despliega cada cambio en `main`. La definición de infraestructura en `../.railway/railway.ts` administra únicamente el servicio web y conserva las variables privadas; no administra ni elimina otros servicios.

## Uso

Entre con la cuenta de demostración. Abra **Seguimiento postoperatorio**, cree un episodio simulado y registre una ficha por llamada. Revise los eventos en **Coordinación** y los campos, listas, reglas y cuidados en **Configuración**. El portal de acompañantes consulta un token individual y recibe avisos mientras está abierto; esta versión no activa servicios de notificación de pago.

La exportación de matriz mantiene los 70 campos originales para las primeras dos llamadas. Las fichas adicionales y adendas permanecen en el historial por episodio. Los indicadores incluyen los intentos y llamadas adicionales según el denominador documentado de cada medida.

El seguimiento admite únicamente cirugías realizadas. Al crear el episodio puede seleccionar un caso operado de la fecha de cirugía visible o registrar manualmente una cirugía ya realizada. La carga masiva y el formulario de paciente conservan `FECHA CITA POP` y `HORA CITA POP`, editables antes de importar; los campos se trasladan al seleccionar el caso operado. Los datos ausentes permanecen vacíos. Un caso quirúrgico tiene un episodio y cada llamada o intento tiene su propia ficha.

Las descargas admiten `RANGO` (`from` y `to` inclusivos), `MES` (`month=AAAA-MM`), `ANIO` (`year=AAAA`) y `DIA`. Los indicadores se calculan sobre el periodo completo; MCI usa los registros diarios, muestra desglose mensual y no promedia porcentajes. Las fuentes faltantes y revisiones heredadas sin registro verificable se presentan como no evaluables. Configuración incorpora listas, fichas técnicas/metas, presentación, actualización del portal y criterio de cita POP, con revisión concurrente y trazabilidad.

Productividad por enfermero jefe: KPI y descarga KPI_ENFERMERIA desglosan cirugías realizadas por responsable preservado al registrar OPERADO. La evidencia histórica de Auditoría puede identificar registros anteriores; los que no tienen evidencia quedan sin atribuir. PASP_PRODUCTIVIDAD_ENFERMERIA mide fichas e intentos, contactos efectivos y pacientes contactados por autor autenticado y por fecha real de llamada. Adendas y guardados repetidos no suman actividad; sin horas trabajadas verificables la productividad por hora es No evaluable. Se mantienen 71 medidas originales y 19 reportes agregados.

KPI incorpora productividad, cancelaciones y tasas por especialista registrado. Realización = realizadas / programadas netas; cancelación = canceladas / programadas brutas. Denominador cero e inconsistencias operado/cancelado se muestran como No evaluable según corresponda. Cada medida por especialista tiene su descarga por período.
