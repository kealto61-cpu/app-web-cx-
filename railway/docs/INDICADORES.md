# Fichas técnicas de indicadores · APP WEB CX 5.9 PASP

Catálogo de 70 medidas individuales (23 de la matriz PASP, 13 ampliaciones de seguimiento y 34 del módulo quirúrgico) y 19 reportes agregados. Dos contadores heredados de revisión de reintervenciones se presentan como **No evaluables**, porque no tienen registro de revisión verificable. Los candidatos son alertas para análisis profesional; no confirman una reintervención ni un evento adverso.

## Periodo y fuentes

En Coordinación → Descargas elija **Rango de fechas**, **Mes completo**, **Año completo** o **Un día**. Rango incluye ambas fechas; mes incluye el primer y último día, respetando años bisiestos; año incluye el 1 de enero al 31 de diciembre. CSV, Excel y PDF indican las fechas exactas.

KPI, profilaxis y POP se agrupan por fecha de cirugía. PASP selecciona los episodios por fecha de cirugía y analiza sus llamadas y escalamientos asociados, incluso si se registran después del periodo; esto es una cohorte quirúrgica, no un conteo de llamadas por fecha del contacto. Seguridad selecciona la nueva cirugía del periodo y busca antecedentes con intervalo menor a 30 días. MCI usa la fecha de cada registro diario.

Los porcentajes del periodo se calculan sobre las sumas pertinentes; no se promedian porcentajes mensuales. En MCI, la ausencia de fuente diaria se muestra como No evaluable. El denominador cero en PASP también es No evaluable. Las metas y fichas técnicas se editan en Configuración → Listas, metas y presentación → Metas y fichas técnicas; el plazo institucional de oportunidad de cita se edita en Presentación y actualización. Las fórmulas base se conservan visibles.

El despliegue Railway utiliza únicamente datos ficticios, en una base aislada de simulación. No son resultados institucionales reales ni indicadores nacionales obligatorios por sí mismos.

## KPI · Indicadores individuales

### 1. Programadas brutas

- **Código:** KPI_PROGRAMADAS_BRUTAS
- **Qué mide:** Número de casos programados en el periodo, incluyendo los cancelados.
- **Fórmula:** Conteo de casos quirúrgicos.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Cada intervención se cuenta una vez; no son pacientes únicos.
- **Descarga individual:** KPI_PROGRAMADAS_BRUTAS (CSV, Excel o PDF; rango, mes o año).

### 2. Programadas netas

- **Código:** KPI_PROGRAMADAS_NETAS
- **Qué mide:** Programación que permanece después de descontar cancelaciones.
- **Fórmula:** Programadas brutas − canceladas.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Incluye casos pendientes de cirugía.
- **Descarga individual:** KPI_PROGRAMADAS_NETAS (CSV, Excel o PDF; rango, mes o año).

### 3. Cirugías realizadas

- **Código:** KPI_REALIZADAS
- **Qué mide:** Intervenciones registradas con OPERADO verdadero.
- **Fórmula:** Conteo de casos con cirugía realizada.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** No se infiere que hubo cirugía por tener solo una programación.
- **Descarga individual:** KPI_REALIZADAS (CSV, Excel o PDF; rango, mes o año).

### 4. Cirugías canceladas

- **Código:** KPI_CANCELADAS
- **Qué mide:** Intervenciones con estado CANCELADO.
- **Fórmula:** Conteo de casos cancelados.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** La causa y atribuibilidad se registran en el reporte de cancelación.
- **Descarga individual:** KPI_CANCELADAS (CSV, Excel o PDF; rango, mes o año).

### 5. Tasa de cancelación

- **Código:** KPI_TASA_CANCELACION
- **Qué mide:** Proporción de la programación bruta que fue cancelada.
- **Fórmula:** Canceladas / programadas brutas × 100.
- **Unidad:** %
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Si no hay programación, el cálculo legado entrega 0; no equivale a desempeño satisfactorio.
- **Descarga individual:** KPI_TASA_CANCELACION (CSV, Excel o PDF; rango, mes o año).

### 6. Tasa de realización

- **Código:** KPI_TASA_REALIZACION
- **Qué mide:** Proporción de la programación neta que se realizó.
- **Fórmula:** Realizadas / programadas netas × 100.
- **Unidad:** %
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Se interpreta con programación y cancelaciones del mismo periodo.
- **Descarga individual:** KPI_TASA_REALIZACION (CSV, Excel o PDF; rango, mes o año).

### 7. Tiempo promedio Preparación → QNO

- **Código:** KPI_TIEMPO_PREPA_QNO
- **Qué mide:** Tiempo entre entrada a Preparación y entrada al quirófano.
- **Fórmula:** Suma de minutos evaluables / número de intervalos positivos registrados.
- **Unidad:** Minutos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Los valores ausentes o cero se excluyen en la implementación actual.
- **Descarga individual:** KPI_TIEMPO_PREPA_QNO (CSV, Excel o PDF; rango, mes o año).

### 8. Tiempo promedio QNO → Recuperación

- **Código:** KPI_TIEMPO_QNO_REC
- **Qué mide:** Tiempo entre entrada al quirófano y entrada a Recuperación.
- **Fórmula:** Suma de minutos evaluables / número de intervalos positivos registrados.
- **Unidad:** Minutos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** No equivale a duración de la cirugía: incluye actividades dentro de QNO.
- **Descarga individual:** KPI_TIEMPO_QNO_REC (CSV, Excel o PDF; rango, mes o año).

### 9. Tiempo muerto promedio

- **Código:** KPI_TIEMPO_MUERTO
- **Qué mide:** Intervalo registrado entre pacientes consecutivos del mismo quirófano.
- **Fórmula:** Suma de intervalos evaluables / número de intervalos positivos registrados.
- **Unidad:** Minutos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** No permite atribuir por sí solo una demora al personal.
- **Descarga individual:** KPI_TIEMPO_MUERTO (CSV, Excel o PDF; rango, mes o año).

## MCI

### 10. Meta diaria por fecha

- **Código:** MCI_META_DIARIA
- **Qué mide:** Objetivo de producción de cada fecha.
- **Fórmula:** Valor de Meta diaria de la base MCI.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Se grafica junto a programadas netas y realizadas; una fecha no debe sustituirse por la fecha actual. En descargas, se agregan los registros diarios del periodo; los porcentajes se recalculan sobre sumas, no se promedian. Fechas sin registro permanecen no evaluables. La proyección requiere una fuente mensual con año explícito y un mes completo; no se suma una proyección anual.
- **Descarga individual:** MCI_META_DIARIA (CSV, Excel o PDF; rango, mes o año).

### 11. Programadas netas por fecha

- **Código:** MCI_PROGRAMADAS_DIARIAS
- **Qué mide:** Cirugías programadas netas en cada fecha.
- **Fórmula:** Valor de Cirugías programadas netas por fecha.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Se compara con la meta diaria y lo realmente ejecutado. En descargas, se agregan los registros diarios del periodo; los porcentajes se recalculan sobre sumas, no se promedian. Fechas sin registro permanecen no evaluables. La proyección requiere una fuente mensual con año explícito y un mes completo; no se suma una proyección anual.
- **Descarga individual:** MCI_PROGRAMADAS_DIARIAS (CSV, Excel o PDF; rango, mes o año).

### 12. Realizadas por fecha

- **Código:** MCI_REALIZADAS_DIARIAS
- **Qué mide:** Cirugías realizadas en cada fecha.
- **Fórmula:** Valor de Cirugías ejecutadas por fecha.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Es la serie de ejecución diaria de la base MCI. En descargas, se agregan los registros diarios del periodo; los porcentajes se recalculan sobre sumas, no se promedian. Fechas sin registro permanecen no evaluables. La proyección requiere una fuente mensual con año explícito y un mes completo; no se suma una proyección anual.
- **Descarga individual:** MCI_REALIZADAS_DIARIAS (CSV, Excel o PDF; rango, mes o año).

### 13. Meta mensual

- **Código:** MCI_META_MENSUAL
- **Qué mide:** Objetivo mensual de producción.
- **Fórmula:** Valor del plan mensual MCI.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** La meta es un parámetro de gestión institucional; no es un estándar legal universal. En descargas, se agregan los registros diarios del periodo; los porcentajes se recalculan sobre sumas, no se promedian. Fechas sin registro permanecen no evaluables. La proyección requiere una fuente mensual con año explícito y un mes completo; no se suma una proyección anual.
- **Descarga individual:** MCI_META_MENSUAL (CSV, Excel o PDF; rango, mes o año).

### 14. Programadas netas del mes

- **Código:** MCI_PROGRAMADAS_MENSUAL
- **Qué mide:** Número de cirugías programadas netas del mes.
- **Fórmula:** Valor mensual de programación neta en MCI.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Se conserva la lógica de la base anual y del resumen mensual. En descargas, se agregan los registros diarios del periodo; los porcentajes se recalculan sobre sumas, no se promedian. Fechas sin registro permanecen no evaluables. La proyección requiere una fuente mensual con año explícito y un mes completo; no se suma una proyección anual.
- **Descarga individual:** MCI_PROGRAMADAS_MENSUAL (CSV, Excel o PDF; rango, mes o año).

### 15. Realizadas del mes

- **Código:** MCI_REALIZADAS_MENSUAL
- **Qué mide:** Intervenciones registradas con OPERADO verdadero.
- **Fórmula:** Conteo de casos con cirugía realizada.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** No se infiere que hubo cirugía por tener solo una programación. En descargas, se agregan los registros diarios del periodo; los porcentajes se recalculan sobre sumas, no se promedian. Fechas sin registro permanecen no evaluables. La proyección requiere una fuente mensual con año explícito y un mes completo; no se suma una proyección anual.
- **Descarga individual:** MCI_REALIZADAS_MENSUAL (CSV, Excel o PDF; rango, mes o año).

### 16. Cumplimiento de la meta mensual

- **Código:** MCI_CUMPLIMIENTO
- **Qué mide:** Grado de logro de la meta mensual.
- **Fórmula:** Realizadas del mes / meta mensual × 100.
- **Unidad:** %
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Puede superar 100%; meta cero impide una interpretación válida. En descargas, se agregan los registros diarios del periodo; los porcentajes se recalculan sobre sumas, no se promedian. Fechas sin registro permanecen no evaluables. La proyección requiere una fuente mensual con año explícito y un mes completo; no se suma una proyección anual.
- **Descarga individual:** MCI_CUMPLIMIENTO (CSV, Excel o PDF; rango, mes o año).

### 17. Tasa de realización mensual

- **Código:** MCI_TASA_REALIZACION
- **Qué mide:** Proporción de la programación neta que se realizó.
- **Fórmula:** Realizadas / programadas netas × 100.
- **Unidad:** %
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Se interpreta con programación y cancelaciones del mismo periodo. En descargas, se agregan los registros diarios del periodo; los porcentajes se recalculan sobre sumas, no se promedian. Fechas sin registro permanecen no evaluables. La proyección requiere una fuente mensual con año explícito y un mes completo; no se suma una proyección anual.
- **Descarga individual:** MCI_TASA_REALIZACION (CSV, Excel o PDF; rango, mes o año).

### 18. Brecha frente a la meta mensual

- **Código:** MCI_BRECHA
- **Qué mide:** Diferencia entre ejecución y meta mensual.
- **Fórmula:** Realizadas del mes − meta mensual.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Negativo: faltante; cero: meta exacta; positivo: excedente. En descargas, se agregan los registros diarios del periodo; los porcentajes se recalculan sobre sumas, no se promedian. Fechas sin registro permanecen no evaluables. La proyección requiere una fuente mensual con año explícito y un mes completo; no se suma una proyección anual.
- **Descarga individual:** MCI_BRECHA (CSV, Excel o PDF; rango, mes o año).

### 19. Proyección mensual

- **Código:** MCI_PROYECCION
- **Qué mide:** Estimación de producción al cierre del mes.
- **Fórmula:** Valor de la proyección institucional en el resumen MCI.
- **Unidad:** Cirugías
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Es una estimación, no una cirugía realizada. El código conserva la proyección del resumen. En descargas, se agregan los registros diarios del periodo; los porcentajes se recalculan sobre sumas, no se promedian. Fechas sin registro permanecen no evaluables. La proyección requiere una fuente mensual con año explícito y un mes completo; no se suma una proyección anual.
- **Descarga individual:** MCI_PROYECCION (CSV, Excel o PDF; rango, mes o año).

## Profilaxis · Indicadores

### 20. Casos con registro de profilaxis

- **Código:** PROF_CASOS
- **Qué mide:** Casos con al menos un dato de profilaxis registrado.
- **Fórmula:** Conteo de casos con profilaxis, hora, clasificación o medicamento.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** El denominador no son todas las cirugías; es el subconjunto con algún registro.
- **Descarga individual:** PROF_CASOS (CSV, Excel o PDF; rango, mes o año).

### 21. Profilaxis administrada

- **Código:** PROF_ADMINISTRADA
- **Qué mide:** Casos que tienen profilaxis marcada Sí.
- **Fórmula:** Conteo de respuestas Sí.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** No acredita medicamento, dosis ni oportunidad adecuados.
- **Descarga individual:** PROF_ADMINISTRADA (CSV, Excel o PDF; rango, mes o año).

### 22. Profilaxis no administrada

- **Código:** PROF_NO_ADMINISTRADA
- **Qué mide:** Casos marcados expresamente No.
- **Fórmula:** Conteo de respuestas No.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** No implica incumplimiento si la profilaxis no estaba indicada.
- **Descarga individual:** PROF_NO_ADMINISTRADA (CSV, Excel o PDF; rango, mes o año).

### 23. Registro de profilaxis pendiente

- **Código:** PROF_PENDIENTE
- **Qué mide:** Casos del subconjunto de profilaxis sin respuesta Sí/No.
- **Fórmula:** Total con algún registro − Sí − No.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** No identifica todos los casos sin ningún dato de profilaxis.
- **Descarga individual:** PROF_PENDIENTE (CSV, Excel o PDF; rango, mes o año).

### 24. Casos con medicamento registrado

- **Código:** PROF_MEDICAMENTO
- **Qué mide:** Casos con nombre del medicamento registrado.
- **Fórmula:** Conteo de medicamentos no vacíos.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Mide completitud, no pertinencia farmacológica.
- **Descarga individual:** PROF_MEDICAMENTO (CSV, Excel o PDF; rango, mes o año).

### 25. Casos con tiempo a incisión registrado

- **Código:** PROF_TIEMPO
- **Qué mide:** Casos del periodo con registro de profilaxis y minutos a incisión diligenciados, incluyendo cero.
- **Fórmula:** Conteo con PROF MIN distinto de vacío o nulo.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Un intervalo de cero minutos es un registro válido; un dato vacío se excluye. Este indicador mide completitud, no oportunidad clínica.
- **Descarga individual:** PROF_TIEMPO (CSV, Excel o PDF; rango, mes o año).

## Seguimiento postoperatorio · Indicadores

### 26. Casos postoperatorios

- **Código:** POP_CASOS
- **Qué mide:** Casos con cirugía registrada como realizada.
- **Fórmula:** Conteo de casos OPERADO verdadero.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Incluye rutas ambulatorias y hospitalizadas; no añade casos solo programados.
- **Descarga individual:** POP_CASOS (CSV, Excel o PDF; rango, mes o año).

### 27. Altas postoperatorias

- **Código:** POP_ALTA
- **Qué mide:** Casos operados con destino Alta.
- **Fórmula:** Conteo de casos POP con destino/estado ALTA.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Se calcula en el periodo seleccionado.
- **Descarga individual:** POP_ALTA (CSV, Excel o PDF; rango, mes o año).

### 28. Hospitalizaciones postoperatorias

- **Código:** POP_HOSPITALIZACION
- **Qué mide:** Casos operados con destino Hospitalización.
- **Fórmula:** Conteo de casos POP hospitalizados.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Es una ruta asistencial, no un evento adverso.
- **Descarga individual:** POP_HOSPITALIZACION (CSV, Excel o PDF; rango, mes o año).

### 29. Pacientes en recuperación

- **Código:** POP_RECUPERACION
- **Qué mide:** Casos operados que permanecen en Recuperación.
- **Fórmula:** Conteo de casos POP en RECUPERACIÓN.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Es una fotografía del estado actual.
- **Descarga individual:** POP_RECUPERACION (CSV, Excel o PDF; rango, mes o año).

### 30. Casos POP con código de seguimiento

- **Código:** POP_SEGUIMIENTO
- **Qué mide:** Casos operados con código de seguimiento para acompañantes.
- **Fórmula:** Conteo de casos POP con código no vacío.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** El código no demuestra contacto telefónico PASP.
- **Descarga individual:** POP_SEGUIMIENTO (CSV, Excel o PDF; rango, mes o año).

### 31. Casos POP sin código de seguimiento

- **Código:** POP_PENDIENTES
- **Qué mide:** Casos operados sin código para acompañantes.
- **Fórmula:** Total POP − casos con código.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** No equivale a casos sin llamada.
- **Descarga individual:** POP_PENDIENTES (CSV, Excel o PDF; rango, mes o año).

## Seguridad · Ventana de 30 días

### 32. Candidatos a reintervención

- **Código:** SEG_CANDIDATOS
- **Qué mide:** Casos con otra intervención del mismo documento en una ventana menor de 30 días.
- **Fórmula:** Conteo de pares consecutivos con 0 ≤ intervalo <30 días.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Son candidatos para revisión: no confirma reintervención no planeada ni evento adverso.
- **Descarga individual:** SEG_CANDIDATOS (CSV, Excel o PDF; rango, mes o año).

### 33. Candidatos revisados

- **Código:** SEG_REVISADOS
- **Qué mide:** Estado de revisión de candidatos a reintervención.
- **Fórmula:** Requiere registro verificable de revisión; resultado actualmente no evaluable.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** No evaluable: no existe un registro verificable de revisión de estos candidatos en el módulo heredado. No se publica un cero ni se supone que todos están pendientes. La gestión de escalamientos PASP se mide por separado.
- **Descarga individual:** SEG_REVISADOS (CSV, Excel o PDF; rango, mes o año).

### 34. Candidatos pendientes de revisión

- **Código:** SEG_PENDIENTES
- **Qué mide:** Candidatos que requieren revisión de seguridad.
- **Fórmula:** Requiere registro verificable de revisión; resultado actualmente no evaluable.
- **Unidad:** Casos
- **Meta inicial:** Meta institucional configurable
- **Periodicidad:** Según rango, mes o año seleccionado
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** No evaluable: no existe un registro verificable de revisión de estos candidatos en el módulo heredado. No se publica un cero ni se supone que todos están pendientes. La gestión de escalamientos PASP se mide por separado.
- **Descarga individual:** SEG_PENDIENTES (CSV, Excel o PDF; rango, mes o año).

## PASP · Matriz institucional

### 35. Total de usuarios registrados

- **Código:** PASP_TOTAL_USERS
- **Qué mide:** Volumen total de usuarios incorporados al programa PASP.
- **Fórmula:** Conteo de episodios quirúrgicos incluidos
- **Unidad:** casos
- **Meta inicial:** Informativo
- **Periodicidad:** Mensual
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Volumen total de usuarios incorporados al programa PASP.
- **Descarga individual:** PASP_TOTAL_USERS (CSV, Excel o PDF; rango, mes o año).

### 36. % de usuarios con cita POP asignada

- **Código:** PASP_APPOINTMENT_ASSIGNED
- **Qué mide:** Proporción de usuarios que requieren consulta postoperatoria y cuentan con fecha asignada.
- **Fórmula:** Episodios con cita / Episodios que requieren cita × 100
- **Unidad:** %
- **Meta inicial:** ≥95%
- **Periodicidad:** Semanal
- **Responsable:** Programación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Proporción de usuarios que requieren consulta postoperatoria y cuentan con fecha asignada.
- **Descarga individual:** PASP_APPOINTMENT_ASSIGNED (CSV, Excel o PDF; rango, mes o año).

### 37. Cobertura de primera llamada

- **Código:** PASP_FIRST_CALL_COVERAGE
- **Qué mide:** Cumplimiento del primer contacto telefónico en todos los usuarios incluidos en PASP.
- **Fórmula:** Episodios con primera ficha realizada / Total de episodios × 100
- **Unidad:** %
- **Meta inicial:** ≥90%
- **Periodicidad:** Semanal
- **Responsable:** Enfermería PASP
- **Interpretación y límites:** Sin denominador: No evaluable. Cumplimiento del primer contacto telefónico en todos los usuarios incluidos en PASP.
- **Descarga individual:** PASP_FIRST_CALL_COVERAGE (CSV, Excel o PDF; rango, mes o año).

### 38. Oportunidad de primera llamada

- **Código:** PASP_FIRST_CALL_TIMELINESS
- **Qué mide:** Puntualidad del primer seguimiento telefónico para todos los usuarios.
- **Fórmula:** Primeras fichas realizadas en fecha objetivo o antes / Primeras fichas realizadas × 100
- **Unidad:** %
- **Meta inicial:** ≥90%
- **Periodicidad:** Semanal
- **Responsable:** Enfermería PASP
- **Interpretación y límites:** Sin denominador: No evaluable. Puntualidad del primer seguimiento telefónico para todos los usuarios.
- **Descarga individual:** PASP_FIRST_CALL_TIMELINESS (CSV, Excel o PDF; rango, mes o año).

### 39. Cobertura de segunda llamada programada

- **Código:** PASP_SECOND_CALL_COVERAGE
- **Qué mide:** Cumplimiento del segundo contacto telefónico programado.
- **Fórmula:** Segundas fichas realizadas y programadas / Segundas programadas × 100
- **Unidad:** %
- **Meta inicial:** ≥85%
- **Periodicidad:** Semanal
- **Responsable:** Enfermería PASP
- **Interpretación y límites:** Sin denominador: No evaluable. Cumplimiento del segundo contacto telefónico programado.
- **Descarga individual:** PASP_SECOND_CALL_COVERAGE (CSV, Excel o PDF; rango, mes o año).

### 40. Oportunidad de segunda llamada

- **Código:** PASP_SECOND_CALL_TIMELINESS
- **Qué mide:** Puntualidad del segundo seguimiento telefónico.
- **Fórmula:** Segundas realizadas en fecha objetivo o antes / Segundas realizadas con fecha programada × 100
- **Unidad:** %
- **Meta inicial:** ≥85%
- **Periodicidad:** Semanal
- **Responsable:** Enfermería PASP
- **Interpretación y límites:** Sin denominador: No evaluable. Puntualidad del segundo seguimiento telefónico.
- **Descarga individual:** PASP_SECOND_CALL_TIMELINESS (CSV, Excel o PDF; rango, mes o año).

### 41. Asistencia a consulta POP

- **Código:** PASP_APPOINTMENT_ATTENDANCE
- **Qué mide:** Adherencia de los usuarios a la consulta postoperatoria asignada.
- **Fórmula:** Asistencia Sí / Asistencia Sí o No × 100
- **Unidad:** %
- **Meta inicial:** ≥90%
- **Periodicidad:** Mensual
- **Responsable:** Programación y Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Adherencia de los usuarios a la consulta postoperatoria asignada.
- **Descarga individual:** PASP_APPOINTMENT_ATTENDANCE (CSV, Excel o PDF; rango, mes o año).

### 42. Hallazgos administrativos identificados

- **Código:** PASP_ADMINISTRATIVE_FINDINGS
- **Qué mide:** Cantidad de barreras relacionadas con citas, autorizaciones o programación.
- **Fórmula:** Conteo en fichas 1 y 2
- **Unidad:** hallazgos
- **Meta inicial:** Tendencia decreciente
- **Periodicidad:** Mensual
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Cantidad de barreras relacionadas con citas, autorizaciones o programación.
- **Descarga individual:** PASP_ADMINISTRATIVE_FINDINGS (CSV, Excel o PDF; rango, mes o año).

### 43. Hallazgos clínicos no urgentes

- **Código:** PASP_NONURGENT_FINDINGS
- **Qué mide:** Situaciones clínicas que requieren educación, control o seguimiento sin urgencia.
- **Fórmula:** Conteo en fichas 1 y 2
- **Unidad:** hallazgos
- **Meta inicial:** Tendencia decreciente
- **Periodicidad:** Mensual
- **Responsable:** Enfermería PASP y Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Situaciones clínicas que requieren educación, control o seguimiento sin urgencia.
- **Descarga individual:** PASP_NONURGENT_FINDINGS (CSV, Excel o PDF; rango, mes o año).

### 44. Hallazgos prioritarios y eventos o incidentes

- **Código:** PASP_PRIORITY_FINDINGS
- **Qué mide:** Número de situaciones que requieren intervención prioritaria o reporte institucional.
- **Fórmula:** Conteo de clasificaciones prioritarias y sospechas en fichas 1 y 2
- **Unidad:** hallazgos
- **Meta inicial:** Gestión inmediata del 100%
- **Periodicidad:** Semanal
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Número de situaciones que requieren intervención prioritaria o reporte institucional.
- **Descarga individual:** PASP_PRIORITY_FINDINGS (CSV, Excel o PDF; rango, mes o año).

### 45. Casos abiertos en Coordinación de Cirugía

- **Código:** PASP_COORDINATION_OPEN
- **Qué mide:** Casos que requieren revisión inicial por Coordinación de Cirugía.
- **Fórmula:** Casos de Coordinación sin revisión documentada
- **Unidad:** casos
- **Meta inicial:** 0 casos vencidos
- **Periodicidad:** Diaria
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Casos que requieren revisión inicial por Coordinación de Cirugía.
- **Descarga individual:** PASP_COORDINATION_OPEN (CSV, Excel o PDF; rango, mes o año).

### 46. Casos en seguimiento por Coordinación de Cirugía

- **Código:** PASP_COORDINATION_FOLLOWUP
- **Qué mide:** Casos revisados que aún requieren acciones antes del cierre.
- **Fórmula:** Casos de Coordinación activos con revisión documentada
- **Unidad:** casos
- **Meta inicial:** 100% con conducta activa
- **Periodicidad:** Diaria
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Casos revisados que aún requieren acciones antes del cierre.
- **Descarga individual:** PASP_COORDINATION_FOLLOWUP (CSV, Excel o PDF; rango, mes o año).

### 47. Casos cerrados por Coordinación de Cirugía

- **Código:** PASP_COORDINATION_CLOSED
- **Qué mide:** Casos con revisión, análisis y resolución finalizados.
- **Fórmula:** Casos con estado Coordinación Cerrado
- **Unidad:** casos
- **Meta inicial:** Informativo
- **Periodicidad:** Mensual
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Casos con revisión, análisis y resolución finalizados.
- **Descarga individual:** PASP_COORDINATION_CLOSED (CSV, Excel o PDF; rango, mes o año).

### 48. % de cierre de casos de Coordinación de Cirugía

- **Código:** PASP_COORDINATION_CLOSURE_RATE
- **Qué mide:** Proporción de casos de coordinación que cuentan con cierre completo.
- **Fórmula:** Cerrados / Abiertos + En seguimiento + Cerrados × 100
- **Unidad:** %
- **Meta inicial:** ≥95%
- **Periodicidad:** Mensual
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Proporción de casos de coordinación que cuentan con cierre completo.
- **Descarga individual:** PASP_COORDINATION_CLOSURE_RATE (CSV, Excel o PDF; rango, mes o año).

### 49. % de escalamientos con responsable registrado

- **Código:** PASP_ESCALATION_OWNER
- **Qué mide:** Trazabilidad de la persona que realizó y escaló el seguimiento.
- **Fórmula:** Conductas de escalamiento con responsable / Conductas de escalamiento × 100
- **Unidad:** %
- **Meta inicial:** 100%
- **Periodicidad:** Semanal
- **Responsable:** Enfermería PASP
- **Interpretación y límites:** Sin denominador: No evaluable. Trazabilidad de la persona que realizó y escaló el seguimiento.
- **Descarga individual:** PASP_ESCALATION_OWNER (CSV, Excel o PDF; rango, mes o año).

### 50. Casos derivados a Seguridad del Paciente

- **Código:** PASP_SAFETY_NOTIFIED_CASES
- **Qué mide:** Número de casos que Coordinación de Cirugía derivó efectivamente a Seguridad del Paciente.
- **Fórmula:** Casos con notificación real documentada Sí
- **Unidad:** casos
- **Meta inicial:** Informativo
- **Periodicidad:** Semanal
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Número de casos que Coordinación de Cirugía derivó efectivamente a Seguridad del Paciente.
- **Descarga individual:** PASP_SAFETY_NOTIFIED_CASES (CSV, Excel o PDF; rango, mes o año).

### 51. Casos resueltos por Coordinación de Cirugía derivados a Seguridad del Paciente

- **Código:** PASP_COORDINATION_CLOSED_SAFETY_NOTIFIED
- **Qué mide:** De los casos cerrados por Coordinación de Cirugía, cuántos fueron derivados a Seguridad del Paciente.
- **Fórmula:** Coordinación Cerrado y notificación Seguridad Sí
- **Unidad:** casos
- **Meta inicial:** Informativo
- **Periodicidad:** Mensual
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. De los casos cerrados por Coordinación de Cirugía, cuántos fueron derivados a Seguridad del Paciente.
- **Descarga individual:** PASP_COORDINATION_CLOSED_SAFETY_NOTIFIED (CSV, Excel o PDF; rango, mes o año).

### 52. % de casos de coordinación con profesional revisor

- **Código:** PASP_COORDINATION_REVIEWER
- **Qué mide:** Trazabilidad del profesional de Coordinación de Cirugía que revisó el caso.
- **Fórmula:** Casos con revisor / Casos que requieren revisión × 100
- **Unidad:** %
- **Meta inicial:** 100%
- **Periodicidad:** Semanal
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Trazabilidad del profesional de Coordinación de Cirugía que revisó el caso.
- **Descarga individual:** PASP_COORDINATION_REVIEWER (CSV, Excel o PDF; rango, mes o año).

### 53. % de hallazgos aplicables con análisis y resolución documentados

- **Código:** PASP_FINDINGS_ANALYZED
- **Qué mide:** Proporción de hallazgos de primera y segunda llamada con análisis y resolución documentados.
- **Fórmula:** Observaciones aplicables con análisis / Observaciones aplicables de llamadas 1 y 2 × 100
- **Unidad:** %
- **Meta inicial:** 100%
- **Periodicidad:** Semanal
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Proporción de hallazgos de primera y segunda llamada con análisis y resolución documentados.
- **Descarga individual:** PASP_FINDINGS_ANALYZED (CSV, Excel o PDF; rango, mes o año).

### 54. Oportunidad de asignación de cita POP

- **Código:** PASP_APPOINTMENT_TIMELINESS
- **Qué mide:** Proporción de usuarios que requieren consulta POP y cuya cita fue asignada dentro del plazo máximo institucional de 10 días calendario posteriores al procedimiento; las asignaciones antes del día 7 se identifican como anticipadas y no penalizan.
- **Fórmula:** Citas ≤10 días calendario / Citas evaluables × 100
- **Unidad:** %
- **Meta inicial:** ≥90%
- **Periodicidad:** Mensual
- **Responsable:** Programación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Proporción de usuarios que requieren consulta POP y cuya cita fue asignada dentro del plazo máximo institucional de 10 días calendario posteriores al procedimiento; las asignaciones antes del día 7 se identifican como anticipadas y no penalizan.
- **Descarga individual:** PASP_APPOINTMENT_TIMELINESS (CSV, Excel o PDF; rango, mes o año).

### 55. Promedio de días procedimiento → cita POP

- **Código:** PASP_APPOINTMENT_MEAN_DAYS
- **Qué mide:** Solo intervalos de 0 a 365 días; un episodio por cirugía.
- **Fórmula:** Suma de intervalos calendario / Citas evaluables
- **Unidad:** días
- **Meta inicial:** Informativo
- **Periodicidad:** Mensual
- **Responsable:** Programación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Solo intervalos de 0 a 365 días; un episodio por cirugía.
- **Descarga individual:** PASP_APPOINTMENT_MEAN_DAYS (CSV, Excel o PDF; rango, mes o año).

### 56. Cita POP más pronta

- **Código:** PASP_APPOINTMENT_MIN_DAYS
- **Qué mide:** Menor intervalo observado de asignación.
- **Fórmula:** Menor intervalo calendario evaluable
- **Unidad:** días
- **Meta inicial:** Informativo
- **Periodicidad:** Mensual
- **Responsable:** Programación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Menor intervalo observado de asignación.
- **Descarga individual:** PASP_APPOINTMENT_MIN_DAYS (CSV, Excel o PDF; rango, mes o año).

### 57. Cita POP más demorada

- **Código:** PASP_APPOINTMENT_MAX_DAYS
- **Qué mide:** Mayor intervalo observado de asignación.
- **Fórmula:** Mayor intervalo calendario evaluable
- **Unidad:** días
- **Meta inicial:** Informativo
- **Periodicidad:** Mensual
- **Responsable:** Programación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Mayor intervalo observado de asignación.
- **Descarga individual:** PASP_APPOINTMENT_MAX_DAYS (CSV, Excel o PDF; rango, mes o año).

## PASP · Seguimiento adicional

### 58. Fichas e intentos registrados

- **Código:** PASP_CALL_ATTEMPTS
- **Qué mide:** No cuenta las adendas como llamadas adicionales.
- **Fórmula:** Conteo de fichas individuales de todos los intentos
- **Unidad:** llamadas
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. No cuenta las adendas como llamadas adicionales.
- **Descarga individual:** PASP_CALL_ATTEMPTS (CSV, Excel o PDF; rango, mes o año).

### 59. Llamadas con contacto efectivo

- **Código:** PASP_EFFECTIVE_CONTACTS
- **Qué mide:** Identidad y autorización son verificadas al registrar la llamada.
- **Fórmula:** Intentos con resultado Sí
- **Unidad:** llamadas
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Identidad y autorización son verificadas al registrar la llamada.
- **Descarga individual:** PASP_EFFECTIVE_CONTACTS (CSV, Excel o PDF; rango, mes o año).

### 60. % de intentos con contacto efectivo

- **Código:** PASP_CONTACT_RATE
- **Qué mide:** No sustituye cobertura ni oportunidad institucional.
- **Fórmula:** Intentos con Sí / Todos los intentos × 100
- **Unidad:** %
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. No sustituye cobertura ni oportunidad institucional.
- **Descarga individual:** PASP_CONTACT_RATE (CSV, Excel o PDF; rango, mes o año).

### 61. Episodios con contacto efectivo

- **Código:** PASP_EPISODES_CONTACTED
- **Qué mide:** Dos llamadas efectivas al mismo episodio cuentan un caso.
- **Fórmula:** Episodios distintos con al menos una llamada Sí
- **Unidad:** casos
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Dos llamadas efectivas al mismo episodio cuentan un caso.
- **Descarga individual:** PASP_EPISODES_CONTACTED (CSV, Excel o PDF; rango, mes o año).

### 62. % episodios con contacto efectivo

- **Código:** PASP_CONTACT_EPISODE_COVERAGE
- **Qué mide:** Denominador por episodio, no por número de fichas.
- **Fórmula:** Episodios con al menos una llamada Sí / Total episodios × 100
- **Unidad:** %
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Denominador por episodio, no por número de fichas.
- **Descarga individual:** PASP_CONTACT_EPISODE_COVERAGE (CSV, Excel o PDF; rango, mes o año).

### 64. Escalamientos registrados

- **Código:** PASP_ESCALATIONS
- **Qué mide:** Crear un escalamiento no equivale a recepción, resolución ni notificación BN.
- **Fórmula:** Conteo de escalamientos independientes
- **Unidad:** escalamientos
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Crear un escalamiento no equivale a recepción, resolución ni notificación BN.
- **Descarga individual:** PASP_ESCALATIONS (CSV, Excel o PDF; rango, mes o año).

### 65. Escalamientos pendientes de Coordinación

- **Código:** PASP_COORDINATION_ESCALATIONS_OPEN
- **Qué mide:** Requieren conducta, respuesta y verificación.
- **Fórmula:** Escalamientos no SP distintos de Resuelto/Cerrado
- **Unidad:** escalamientos
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Requieren conducta, respuesta y verificación.
- **Descarga individual:** PASP_COORDINATION_ESCALATIONS_OPEN (CSV, Excel o PDF; rango, mes o año).

### 66. Escalamientos a Seguridad

- **Código:** PASP_SAFETY_ESCALATIONS
- **Qué mide:** No es el indicador de casos con BN=Sí.
- **Fórmula:** Conteo de fichas de gestión Seguridad
- **Unidad:** escalamientos
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. No es el indicador de casos con BN=Sí.
- **Descarga individual:** PASP_SAFETY_ESCALATIONS (CSV, Excel o PDF; rango, mes o año).

### 67. Investigaciones de Seguridad cerradas

- **Código:** PASP_SAFETY_ESCALATIONS_CLOSED
- **Qué mide:** No cierra el seguimiento PASP ni confirma por sí solo evento adverso.
- **Fórmula:** Gestiones Seguridad con estado Cerrado
- **Unidad:** escalamientos
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. No cierra el seguimiento PASP ni confirma por sí solo evento adverso.
- **Descarga individual:** PASP_SAFETY_ESCALATIONS_CLOSED (CSV, Excel o PDF; rango, mes o año).

### 68. % cierre de gestiones Seguridad

- **Código:** PASP_SAFETY_CLOSURE_RATE
- **Qué mide:** Incluye investigación de sospechas descartadas o indeterminadas.
- **Fórmula:** Gestiones Seguridad cerradas / Gestiones Seguridad × 100
- **Unidad:** %
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Incluye investigación de sospechas descartadas o indeterminadas.
- **Descarga individual:** PASP_SAFETY_CLOSURE_RATE (CSV, Excel o PDF; rango, mes o año).

### 69. Citas POP >10 días

- **Código:** PASP_APPOINTMENT_LATE
- **Qué mide:** Plazo institucional.
- **Fórmula:** Citas evaluables con intervalo >10 días
- **Unidad:** casos
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Plazo institucional.
- **Descarga individual:** PASP_APPOINTMENT_LATE (CSV, Excel o PDF; rango, mes o año).

### 70. Citas POP <7 días

- **Código:** PASP_APPOINTMENT_EARLY
- **Qué mide:** Se identifica asignación anticipada sin penalizar.
- **Fórmula:** Citas evaluables con intervalo <7 días
- **Unidad:** casos
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Se identifica asignación anticipada sin penalizar.
- **Descarga individual:** PASP_APPOINTMENT_EARLY (CSV, Excel o PDF; rango, mes o año).

### 71. Sin cita y plazo >10 días

- **Código:** PASP_APPOINTMENT_OVERDUE_WITHOUT_DATE
- **Qué mide:** Evalúa a fecha actual de Bogotá; no aplica a procedimientos exentos.
- **Fórmula:** Episodios elegibles sin cita con más de 10 días desde cirugía
- **Unidad:** casos
- **Meta inicial:** Informativo
- **Periodicidad:** Según cohorte por fecha de cirugía
- **Responsable:** Coordinación de Cirugía
- **Interpretación y límites:** Sin denominador: No evaluable. Evalúa a fecha actual de Bogotá; no aplica a procedimientos exentos.
- **Descarga individual:** PASP_APPOINTMENT_OVERDUE_WITHOUT_DATE (CSV, Excel o PDF; rango, mes o año).

## Reportes agregados

Estos 19 reportes reúnen varias medidas o desglosan las existentes por responsable; no son 19 indicadores adicionales.

- **KPI general** (`KPI_GENERAL`): reporte del periodo seleccionado.
- **Productividad quirúrgica** (`KPI_PRODUCTIVIDAD`): reporte del periodo seleccionado.
- **Tiempos por QNO** (`KPI_TIEMPOS`): reporte del periodo seleccionado.
- **Tiempos muertos por QNO** (`KPI_MUERTOS_QNO`): reporte del periodo seleccionado.
- **Indicadores por especialidad** (`KPI_ESPECIALIDADES`): reporte del periodo seleccionado.
- **Indicadores de cancelación** (`KPI_CANCELACIONES`): reporte del periodo seleccionado.
- **Flujo de pacientes por etapa** (`KPI_FLUJO`): reporte del periodo seleccionado.
- **MCI diario: meta, programadas y realizadas** (`MCI_DIARIO`): reporte del periodo seleccionado.
- **MCI: todos los indicadores mensuales** (`MCI_MENSUAL`): reporte del periodo seleccionado.
- **Profilaxis: todos los indicadores** (`PROF_INDICADORES`): reporte del periodo seleccionado.
- **Cuidados POP: todos los indicadores** (`POP_INDICADORES`): reporte del periodo seleccionado.
- **Detalle de candidatos a reintervención** (`SEG_DETALLE`): reporte del periodo seleccionado.

- **Productividad quirúrgica por enfermero jefe** (`KPI_ENFERMERIA`): cirugías realizadas y estado/destino por responsable registrado en cada caso.
- **Productividad de llamadas por enfermero jefe** (`PASP_PRODUCTIVIDAD_ENFERMERIA`): fichas, contactos efectivos y pacientes contactados por autor de la llamada.

## Productividad por enfermero jefe

**Cirugía — Coordinación → KPI → Productividad por enfermero jefe.** Se agrupan los casos por **ENFERMERO JEFE CIRUGÍA**, conservado al registrar por primera vez la cirugía realizada, o por evidencia histórica de ese mismo registro en Auditoría. El campo ENFERMERO JEFE del último movimiento no se usa para asignar producción. Cirugías realizadas = casos distintos con `OPERADO = verdadero`. Guardar o mover de nuevo un caso no incrementa el conteo. Los casos registrados sin cirugía realizada se muestran aparte del volumen realizado. Alta, Hospitalización y Recuperación desglosan el estado/destino al consultar. La fecha del período es la fecha de cirugía. Los casos sin jefe aparecen en **SIN RESPONSABLE HISTÓRICO VERIFICABLE**; nunca se asignan al jefe del turno actual. Los registros anteriores sin evidencia histórica verificable quedan sin atribuir. El texto del responsable debe ser consistente; no identifica por sí solo a todos los integrantes del equipo ni toda la carga de enfermería.

**Llamadas — Seguimiento postoperatorio → Productividad de llamadas por enfermero jefe / profesional.** El período corresponde a la **fecha real de llamada**, incluyendo cirugías de meses anteriores. Se agrupa por la cuenta que registró cada ficha, con nombre y usuario; las nuevas fichas guardan también el identificador estable de la cuenta, tomado de la sesión. No se acepta un autor enviado desde el formulario. Los registros sin autor verificable quedan en una fila separada.

| Medida por profesional | Cálculo e interpretación |
|---|---|
| Fichas / intentos registrados | Fichas originales distintas por ID en el período de actividad. No suma adendas ni el mismo guardado repetido. |
| Contactos efectivos | Fichas cuyo resultado del contacto es Sí. |
| Sin contacto efectivo | Fichas / intentos menos contactos efectivos. |
| Pacientes contactados distintos | Documentos distintos con al menos un contacto efectivo por ese profesional. El mismo paciente con dos cirugías cuenta una persona; puede aparecer con más de un profesional. No sumar estas filas para obtener pacientes únicos institucionales. |
| Episodios trabajados | Episodios quirúrgicos distintos con una ficha del profesional, haya o no contacto efectivo. |
| Primera, segunda y adicionales | Fichas con número 1, número 2 y los demás números; cada llamada mantiene su ficha independiente. |
| Contacto efectivo (%) | Contactos efectivos / fichas registradas por el mismo profesional × 100. Sin fichas: No evaluable; no se inventa 0 %. |
| Actividad por hora trabajada | **No evaluable** hasta disponer de horas trabajadas verificables. No se usa el tiempo de cirugía, la sesión abierta ni los días calendario como horas laborales. |

Ejemplo: un jefe registra 10 fichas y logra 6 contactos efectivos en 4 pacientes: productividad documentada **10 fichas**, **6 contactos efectivos**, **4 pacientes contactados**, con efectividad de contacto **60 %**. Esto mide volumen registrado; no constituye una evaluación de calidad clínica ni comparación ajustada por jornada, complejidad y carga.

Ambos reportes se descargan por rango, mes o año en **Coordinación → Descargas**, en CSV, Excel o PDF. El reporte **Productividad quirúrgica** también incorpora el detalle por enfermero jefe. Se mantienen las 70 medidas vigentes y su numeración: estos reportes desglosan medidas existentes por responsable.

## Productividad, cancelaciones y tasas por especialista

Vista en **Coordinación → KPI**. Descargas por **rango, mes o año** en CSV, Excel y PDF, con reporte completo y cuatro descargas separadas. Se usa **ESPECIALISTA registrado en el caso**, agrupando nombres equivalentes por mayúsculas, acentos y espacios; los nombres deben ser consistentes. Se cuenta cada caso quirúrgico distinto una vez, dentro de la fecha de cirugía del período seleccionado. Los casos sin especialista se muestran en una fila explícita.

| Medida por especialista | Fórmula |
|---|---|
| Programadas brutas | Casos distintos programados en el período. |
| Cancelaciones | Casos con estado CANCELADO. |
| Programadas netas | Programadas brutas − canceladas. |
| Productividad | Cirugías registradas como realizadas: OPERADO verdadero. |
| Pendientes de realización | Programadas netas − realizadas, salvo inconsistencia operado/cancelado. |
| Tasa de realización | Realizadas / programadas netas × 100. Si netas = 0: No evaluable. |
| Tasa de cancelación | Canceladas / programadas brutas × 100. Si brutas = 0: No evaluable. |

Ejemplo: un especialista tiene **20 programadas, 2 canceladas y 15 realizadas**: netas = **18**; tasa de realización = **83,33 %**; tasa de cancelación = **10 %**; pendientes = **3**. No se promedian porcentajes diarios o mensuales para el rango: se calcula sobre los conteos completos del especialista.

Una cancelación vinculada con la programación de un especialista **no demuestra que él sea su causa**; el análisis causal conserva el motivo y la clasificación del caso. Un registro marcado simultáneamente operado y cancelado se señala para revisión, conservando los conteos originales; su tasa de realización y sus pendientes son No evaluables. La productividad por hora requiere horas verificables y no se calcula a partir de la duración de la cirugía.

- **Especialistas: productividad y tasas** (`KPI_ESPECIALISTAS`): desglose por especialista del período seleccionado.
- **Productividad por especialista** (`KPI_PRODUCTIVIDAD_ESPECIALISTA`): desglose por especialista del período seleccionado.
- **Cancelaciones por especialista** (`KPI_CANCELACIONES_ESPECIALISTA`): desglose por especialista del período seleccionado.
- **Tasa de realización por especialista** (`KPI_TASA_REALIZACION_ESPECIALISTA`): desglose por especialista del período seleccionado.
- **Tasa de cancelación por especialista** (`KPI_TASA_CANCELACION_ESPECIALISTA`): desglose por especialista del período seleccionado.

## Configuración sin editar código

La página permite editar listas de programación y cancelaciones, nombres y metas de indicadores, nombre de la aplicación, texto del servicio, color y tiempo de actualización del portal abierto. PASP permite editar etiquetas, ayudas, opciones de respuesta, campos adicionales, listas, tiempos entre llamadas, festivos, días no hábiles, directorio y plazos de escalamiento, fichas educativas y sinónimos del buscador. También conserva las configuraciones de QNO, flujo, mensajes, usuarios, roles y permisos. Los cambios requieren motivo y versión vigente; conservan los registros históricos.

Las opciones clínicas canónicas conservan su significado para que las mediciones sean comparables. La orientación de urgencias es visible y editable; los códigos que identifican señales de gravedad mantienen su control clínico. Cambiar una meta no reescribe la historia ni modifica el denominador. Cada llamada o intento sigue teniendo una ficha individual y las aclaraciones se añaden como adendas.

## Desglose de cancelaciones por motivo seleccionado

KPI_CANCELACIONES y la vista Cancelaciones agrupan por el valor elegido en la lista Motivo seleccionado (campo técnico causa / CAUSA PRINCIPAL). Cada motivo específico se muestra asociado a esa selección y con su conteo. Observaciones generales, gestión y atribuibilidad permanecen en el registro, pero no se usan como categorías de este desglose. La fuente histórica es qx_cancellations; se toma el registro más reciente por caso cancelado. Sin selección estructurada verificable se muestra SIN MOTIVO SELECCIONADO y no se interpreta texto libre. El conteo, la tasa y sus denominadores no cambian.
