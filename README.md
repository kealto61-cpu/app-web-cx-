# APP WEB CX · Seguimiento postoperatorio PASP

Versión Railway: **5.9.0-pasp**. El código, las definiciones de la matriz, las pruebas y la configuración del despliegue están en este repositorio. La aplicación se publica desde `main`, carpeta `railway/`.

## Despliegue de demostración

Esta versión funciona exclusivamente con **pacientes ficticios**. `DATA_MODE=SIMULATED` es obligatorio. Todas las tablas se inicializan en el esquema PostgreSQL `qx_simulation`, sin consultar, copiar o migrar pacientes, usuarios o registros clínicos de Google Drive o del esquema `public`.

El repositorio es público: no contiene credenciales, PIN de despliegue ni información de pacientes reales. Las variables privadas se conservan en Railway. Las pruebas usan una base PostgreSQL temporal en memoria.

## Seguimiento postoperatorio

- Un episodio por intervención; **una ficha independiente por cada llamada o intento**, incluyendo llamadas adicionales. Las fichas son inmutables y admiten adendas trazables.
- Fecha real, profesional, contacto, valoración, recomendaciones, clasificación, conducta, cita y gestión de hallazgos. Los 70 encabezados de la matriz PASP se conservan en la definición y en la exportación compatible.
- Programación de llamadas con plazos, base de cálculo, calendario y festivos configurables. La segunda llamada toma la primera llamada efectiva según la regla elegida.
- Eventos escalados a Coordinación de Cirugía o Seguridad del Paciente, con permisos, responsable, análisis y resolución independientes del registro de la llamada.
- Indicadores de la matriz con denominadores explícitos, filtros por fecha y descarga separada.
- Catálogo educativo de 38 fichas y 39 conceptos de búsqueda; procedimientos, anestesia, recomendaciones, alarmas, fuentes y sinónimos editables desde la página.
- Campos y listas del formulario, reglas de seguimiento y criterios administrativos de cierre editables en Configuración. Los cambios no sobrescriben las fichas anteriores.

La búsqueda de cuidados muestra candidatos cuando la descripción es ambigua; el profesional o acompañante confirma el procedimiento. Las señales de alarma indican una conducta de consulta y no asignan una categoría de triage ni un diagnóstico.

## Funciones quirúrgicas conservadas

Operativo con Preparación y QNO configurables, jefe de turno, camas, movimientos, profilaxis, tiempos intraoperatorios, Alta/Hospitalización, programación, lector PDF e imágenes, corrección antes de importar, portal de acompañantes, QR y token individual, avisos mientras el portal está abierto, KPI, MCI con meta/programadas/realizadas, descargas por indicador y administración de usuarios con PIN alfanumérico de 4 a 16 caracteres.

## Instalación y validación

Ver [railway/README.md](railway/README.md), [.railway/README.md](.railway/README.md) y el flujo de validación en `.github/workflows/validate.yml`. `/health` confirma la versión, el modo de datos y la conexión a la base.

Los archivos `.gs`, `Index.html` y `appsscript.json` de la raíz mantienen la variante Google Apps Script V8 y sus correcciones previas. La nueva implementación completa de PASP pertenece a Railway. `APPS_SCRIPT_INSTALL.md` es la guía de la variante Apps Script; la carpeta `railway/` no se copia a ese editor.

## Fuentes y decisiones

Las definiciones de los campos y de los indicadores se transcriben de los encabezados, listas y fórmulas de la matriz original, sin registros de pacientes. Las discrepancias de fechas, estados y cierre se explican en los metadatos de esas definiciones. Las referencias científicas se incluyen en cada ficha educativa.

La propuesta que cita la Resolución 1732 de 2026 no se utiliza como norma vigente: fue derogada por la Resolución 2080 del 8 de septiembre de 2026. El marco de habilitación utilizado continúa siendo la Resolución 3100 de 2019 y sus modificaciones vigentes. Las fichas científicas complementan las instrucciones individuales de egreso.
