# MAPA DE CÁLCULOS DEL SISTEMA DE GESTIÓN ESCOLAR

Este documento es la **única fuente de verdad documental** sobre todas las fórmulas matemáticas, estadísticas y algoritmos de agregación ejecutados en el sistema. Debe actualizarse cada vez que se modifique o incorpore una fórmula en el código.

---

## 1. Jerarquía de Agregación de Calificaciones (Niveles 0 → 6)

Principio arquitectural: **Todo promedio superior es una agregación recursiva del nivel inmediatamente inferior**. Ningún nivel recalcula fórmulas desde cero; todos consumen la función del nivel precedente con exclusión estricta de entidades sin calificaciones registradas (no cuentan como 0).

| Nivel | Pantalla / Componente | Dato Mostrado | Fórmula Exacta | Función / Archivo | Fuente de Datos (Tablas) | Reglas de Exclusión / Casos Borde |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | Clase en Vivo / Calificaciones | Nota de Actividad / Tarea | Valor numérico asignado en escala 01 a 20 (o porcentaje según rúbrica convertido a escala 0-20). | `gradesService.createGrade`, `saveClassActivityGrades` (`apps/backend/src/services/grades.service.ts`) | `Grade`, `ClassActivity.scores` (JSON) | Notas `null` o sin calificar no se promedian. |
| **1** | Plan de Evaluación / Criterio | Nota de Criterio Evaluativo | Promedio ponderado o simple de las actividades asociadas a la fila del plan: NotaCriterio = suma(nota_i) / N | `lapso-average.ts` / `grades.service.ts` | `EvaluationPlanRow`, `Grade`, `ClassActivity` | Si el criterio no tiene actividades calificadas, no aporta al lapso. |
| **2** | Perfil de Estudiante / Libreta de Calificaciones / Pestaña Calificaciones | Promedio de Estudiante en Materia (Lapso o Ciclo) | **Por Lapso:** PromedioLapso = suma(NotaActividad_i * Puntos_i) / suma(Puntos_i)<br>**Global Ciclo:** Media simple de los lapsos que tienen al menos una nota real: PromGlobal = suma(PromedioLapso_l) / L_con_datos | `gradesService.calculateWeightedSubjectAverage` (`apps/backend/src/services/grades.service.ts`) | `Grade`, `ClassActivity`, `EvaluationPlanRow`, `Period` | Lapsos sin notas no se dividen (un lapso vacío no baja el promedio). |
| **3** | Detalle de Materia en Sección / Pestaña Materias | Promedio de la Materia en la Sección | Media aritmética del Nivel 2 de todos los estudiantes de la sección que tienen **al menos una nota** en esa materia: PromMateria = suma(Nivel2(s, m)) / TotalEstudiantesConNota | `aggregationService.subjectSectionAverage` (`apps/backend/src/services/aggregation.service.ts`) | `StudentClassroom`, `Grade`, `ClassActivity` | Estudiantes inscritos que no han recibido ninguna calificación son excluidos de la muestra. |
| **4** | Sección / Pestaña Resumen Académico | Promedio General de la Sección | Media aritmética del Nivel 3 de todas las materias de la sección que tienen datos: PromSeccion = suma(Nivel3(m)) / TotalMateriasConNota | `aggregationService.sectionAverage` (`apps/backend/src/services/aggregation.service.ts`) | `ClassroomSubject`, `Subject`, `Grade` | Materias sin notas cargadas no ponderan como 0; se omiten del divisor. |
| **5** | Dashboard de Año Académico (1er a 5to Año) | Promedio del Año (Nivel Académico) | Media aritmética del Nivel 4 de todas las secciones pertenecientes a ese año: PromAño = suma(Nivel4(sec)) / TotalSeccionesConNota | `aggregationService.yearGradeAverage` (`apps/backend/src/services/aggregation.service.ts`) | `Classroom` (filtrado por `grade`), `Grade` | Secciones vacías o sin notas cargadas se excluyen. |
| **6** | Dashboard Ciclo Escolar / Estadísticas Globales | Promedio Global del Ciclo Escolar | Media aritmética del Nivel 5 de todos los años/grados del ciclo: PromCiclo = suma(Nivel5(g)) / TotalGradosConNota | `aggregationService.cycleAverage` (`apps/backend/src/services/aggregation.service.ts`) | `AcademicYear`, `Classroom` | Si solo 1er Año tiene notas cargadas, el promedio del ciclo es idéntico al de 1er Año. |

### 1a. A qué evaluación del plan suma cada actividad de la clase

**Añadido el 2026-09-27** (`services/evaluacion-de-la-semana.service.ts`). El nivel 1
no cambia: nota de la evaluación = promedio de sus actividades calificadas (cada una
llevada a 20) ÷ 20 × sus puntos (`utils/lapso-average.ts`). Ejemplo: vale 4 pts, 4
actividades con 20 → 4 pts; con 20, 10, 20, 10 → 3 pts. Es **promedio, no suma**.
Lo que cambia es **qué actividades son de cada evaluación**:

| Regla | Antes | Ahora |
| :--- | :--- | :--- |
| Semana de la actividad | La de la clase que se veía (y sin sesión, su `createdAt` en UTC) | La de su fecha de entrega si la tiene; si no, la de su clase (`utils/actividad-del-dia.ts`, en la zona del liceo) |
| Evaluación que cubre la semana | La fila de la semana EXACTA, la primera | Toda fila con puntos desde su semana hasta la última unida en su actividad o sus puntos (`extraData.__uniones`; no `endWeekNumber`) |
| Varias en la semana | Iba a la primera | El profesor elige (400 `ELIGE_LA_EVALUACION` si no) |
| Ninguna en la semana | Quedaba en la fila vacía (0 pts) y no contaba, sin avisar | Igual no cuenta (formativa), pero la pantalla lo dice al crearla |
| Guardar el plan quitando o dejando en 0 una evaluación con notas | Sus notas salían del promedio | 409 `EVALUACION_CON_NOTAS` |
| Copiar el plan encima de otra sección | Las actividades del destino quedaban sin evaluación | Se enganchan a la nueva que cubra su semana |

Las actividades de antes que quedaron en una fila vacía se enganchan con
`npx tsx src/scripts/reenlazar-actividades-al-plan.ts [slug] --aplicar` (en seco sin
`--aplicar`). **Cambia promedios del lapso**: avisar al liceo antes. Pruebas
ACTDIA-01…06, SEMEVAL-01…07.

### 1a-bis. La nota de una actividad calificada con un instrumento

**Añadido el 2026-09-28** (`utils/instrumentos.ts`, copiada en `apps/web/src/lib/instrumentos.ts`;
INSTR-*). El instrumento se arma en la evaluación del plan; la actividad guarda su copia al
calificarse (cambiar el plan después no cambia lo ya calificado).

| Tipo | Nota de la actividad | Máximo | Sin nota cuando… |
| :--- | :--- | :--- | :--- |
| Lista de cotejo | suma de los puntos que se le dan en cada indicador, de 0 a lo que vale (29-09-2026; antes solo sí/no: «sí» sigue valiendo todo y «no», 0) | suma de los puntos | nunca (lo que no se puntúa cuenta 0) |
| Escala de estimación | suma de valor del nivel × peso (AD 4, A 3, B 2, C 1 por defecto) | nivel más alto × suma de pesos | falta el nivel de algún criterio |
| Rúbrica | igual que la escala | igual | igual |
| Por puntos (Ser, Hacer, Conocer, Convivir) | suma de los puntos de cada criterio (0 a su máximo) | suma de los puntos | falta algún criterio |

La nota va a `ClassActivity.scores` y `maxScore` = máximo del instrumento: desde ahí sigue el
nivel 1 de siempre (se lleva a 20 y se promedia con las demás de la evaluación). Con
instrumento no se pone nota a mano (409 `NOTA_POR_INSTRUMENTO`), salvo al alumno evaluado de
otra forma.

### 1b. Las materias con apreciación (sin nota) no entran en ningún promedio

**Añadido el 2026-09-26.** Cada materia dice cómo se evalúa (`Subject.evaluacion`):
`NUMERICA` (01 a 20, lo de siempre) o `CUALITATIVA` (Orientación y Convivencia,
Grupos de Creación…: «Consolidado», «En proceso», «Iniciado» o las palabras que ponga
el liceo en `academicConfig.apreciaciones`).

| Dónde | Regla | Función / Archivo |
| :--- | :--- | :--- |
| **Nivel 2** (promedio del alumno en la materia) | Una materia cualitativa sale **«sin notas»** (`conNotas: false`), tenga o no notas de antes. Como todo lo de encima (niveles 3-6, riesgo, cierre, boleta, resumen) ya deja fuera lo que no tiene notas, **el filtro está en un solo sitio**. | `gradesService.promedioDelLapso`, `bulkSubjectAveragesConDatos`, `aggregation.studentsWithNoteInSubject` → `apreciaciones.service.esCualitativa` |
| Consultas que promedian notas de varias materias a la vez (`grade.groupBy`, `grade.aggregate`) | Solo notas de materias `NUMERICA`: `...NOTAS_QUE_CUENTAN` en el `where`. | `cycle-statistics.service`, `dashboard.service`, `students.service`, `reports.service`, `academic-years.controller`, `classrooms.controller`, `users.controller` |
| Cierre del ciclo | La materia cualitativa no es reprobada ni pendiente y no entra en `finalAverage`; el expediente la guarda como `{ cualitativa: true, apreciacion }` (la **final**). | `prepareClose` (`close-cycle.service.ts`) |
| Boleta y resumen final | Sale su apreciación (por lapso y final en la boleta; la final en el resumen), aparte y sin contar en los promedios ni en aprobados/reprobados. | `boleta.service.ts`, `resumen-final.service.ts` |

La apreciación la pone el profesor que da esa materia en esa sección (o el admin);
el guía de la sección solo la mira. Pruebas: CUALI-01…05, CUALI-UI-01.

### 1c. Los lapsos cursados en otro liceo (alumno trasladado)

**Añadido el 2026-09-28** (`services/traslado.service.ts`, tabla `notas_de_otro_plantel`).
El alumno que llega a mitad de año con su archivo de traslado trae la nota de cada
lapso que cursó allá, emparejada con una materia de aquí.

| Dónde | Regla | Función / Archivo |
| :--- | :--- | :--- |
| **Nivel 2**, un lapso | Si el alumno **no tiene notas propias** de esa materia en ese lapso, el promedio del lapso es la nota traída (`conNotas: true`). Una sola nota propia manda sobre la traída. | `gradesService.promedioDelLapso`, `bulkSubjectAveragesConDatos` (los dos caminos, TRAS-07) |
| Niveles 3-6, boleta, resumen, cierre | Nada propio: consumen el nivel 2. | — |
| Consultas que promedian notas crudas (`grade.groupBy`) | **No** ven la nota traída (no es una `Grade`): la estadística de riesgo por materias puede no contarla. | `cycle-statistics.service`, `reports.service` |

Los años anteriores del archivo van a la certificación como «de otro plantel»
(`calificaciones_externas`). Pruebas: TRAS-05…07.

---

## 2. Plan de Evaluación y Ponderaciones

| Pantalla / Componente | Dato Mostrado | Fórmula Exacta | Función / Archivo | Fuente de Datos (Tablas) | Reglas / Validaciones |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Plan de Evaluación (Edición)** | Ponderación (%) por fila | Ponderacion = round((Puntos / 20) * 100, 2) | Derivada reactiva en `EvaluationPlanSection.tsx` y `weekRowsToDbRows` | `EvaluationPlanRow.puntos`, `EvaluationPlanRow.ponderacion` | **Fuente única de verdad: Puntos (0-20).** La ponderación es 100% derivada, nunca editable de forma desacoplada. |
| **Plan de Evaluación (Distribuir)** | Distribuir Equitativamente | Para N semanas con actividad:<br>ptPerItem = floor((20 / N) * 100) / 100<br>Último elemento: lastPt = 20 - suma(pt_1..N-1) | `distributeEqually` (`apps/web/src/components/evaluation/EvaluationPlanSection.tsx`) | State React `weeks` | La suma de puntos da siempre 20.00 exacto y la suma de ponderaciones 100.00% exacto para cualquier valor de N (1 a 52). |
| **Plan de Evaluación (Guardado)** | Validación de 20 Puntos | abs(suma(Puntos_EVALUATION) - 20) <= 0.009 (si hay criterios definidos) | `batchUpsertRows` (`apps/backend/src/controllers/evaluation-plan.controller.ts`) | `EvaluationPlanRow` | Se permite guardar borradores vacíos (suma = 0). Filas vacías restantes de semanas futuras no invalidan el guardado. |

---

## 3. Riesgo Académico y Rendimiento

| Pantalla / Componente | Dato Mostrado | Fórmula Exacta | Función / Archivo | Fuente de Datos (Tablas) | Reglas / Umbrales |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dashboard de Sección / Año / Ciclo** | Estudiantes en Riesgo Académico (Conteo y Lista) | Sea `minPassing` = `notaMinimaAprobatoria` de la configuración del instituto (default 10 si no está definida). Un estudiante s está en riesgo si cumple cualquiera de las 2 condiciones:<br>1. Tiene al menos una materia con promedio de lapso/ciclo < `minPassing` (Nivel2(s, m) < minPassing).<br>2. Su promedio global de todas las materias es < `minPassing`. | `getAcademicYearStats`, `getGradeAcademicStats`, `sectionStudentAverages` (`apps/backend/src/controllers/academic-years.controller.ts`), `dashboard.service.ts` | `Grade`, `StudentClassroom`, `ClassroomSubject`, `Institute.academicConfig` | El umbral **es configurable por instituto**, nunca hardcodeado. La escala venezolana MPPE (01-09 reprobado / 10-20 aprobado) es solo el **default**: un liceo puede fijar `notaMinimaAprobatoria` en otro valor y todos los cálculos de riesgo deben respetarlo. |
| **Promedios jerárquicos (materia / sección / grado / ciclo)** | Estudiantes en Riesgo en `/api/statistics/*` | La misma regla de la fila anterior: `minPassing` = `notaMinimaAprobatoria` del instituto (default 10). | `cycleStatisticsService.getSubjectAverage`, `getSectionGlobalAverage`, `getGradeAverage`, `getCycleGlobalAverage` (`apps/backend/src/services/cycle-statistics.service.ts`) | `Grade`, `StudentClassroom`, `Institute.academicConfig` | **Corregido el 2026-09-14.** Este servicio usaba una constante fija `PASSING_GRADE = 9.5` escrita en el código. El mismo alumno con 9,7 salía **aprobado** aquí y **reprobado** en su perfil, en el panel y en la promoción, que sí usan la nota del instituto. Y un liceo con la mínima en 12 no cambiaba nada. La nota mínima resuelta va ahora también **en la clave del caché** (`…:min<valor>`): si el liceo la cambia, lo guardado con la anterior no puede seguir contestando. Tests: `auditoria-numeros-que-no-cuadran.test.ts` (CAL-01 a CAL-04). |
| **Dashboard de Sección / Año / Ciclo** | Rango Min / Max de Promedios | Min = min(PromedioEstudiante(s)), Max = max(PromedioEstudiante(s)) | `getAcademicYearStats`, `yearGradeStudentDetails` (`apps/backend/src/services/aggregation.service.ts`) | `Grade`, `StudentClassroom` | Se calcula sobre el promedio global por estudiante (Nivel 2 consolidado), no sobre notas aisladas de actividades ni sobre promedios de sección. |

---

## 4. Asistencia Escolar

| Pantalla / Componente | Dato Mostrado | Fórmula Exacta | Función / Archivo | Fuente de Datos (Tablas) | Reglas / Umbrales |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Perfil de Estudiante** | Asistencia (%) de Estudiante | AsistenciaEstudiante = ((Presentes + Tardanzas) / TotalRegistros) * 100 | `dashboardService`, `cycleStatisticsService`, `reports.service.ts` | `DailyAttendance` (`status in {PRESENT, LATE, ABSENT, EXCUSED}`) | Justificadas (`EXCUSED`) pueden excluirse del denominador según configuración del instituto. **Ojo con el nombre:** la función `getStudentAttendanceStats` que citaba esta fila **no existe**; el detalle por alumno lo sirve `getStudentAttendance` (`attendance.controller.ts`). |
| **Resumen de asistencia de un alumno** (`GET /api/attendance/summary/student/:id` y `/api/attendance/student/:id`) | Conteo y porcentajes del alumno | `presentPercentage = Presentes / TotalRegistros * 100` — **solo PRESENT**, las tardanzas van aparte en `late`. No es la "asistencia" de las demás pantallas, que sí suma las tardanzas. | `getStudentAttendance` (`apps/backend/src/controllers/attendance.controller.ts`) | `DailyAttendance` | **Corregido el 2026-09-14.** `/summary/student/:id` declaraba una plantilla de respuesta con campos que el código no envía, y Fastify descarta lo no declarado: la ruta respondía **200 con `{}`**. Se quitó la plantilla, como en la ruta hermana. Test: CAL-06. |
| **Lista de alumnos** (`GET /api/students`) | Asistencia (%) de cada alumno en la lista | `((Presentes + Tardanzas) / TotalRegistros) * 100`, **solo con los registros del ciclo de su sección** (fechas del año escolar). | `getStudents` (`apps/backend/src/controllers/students.controller.ts`) | `DailyAttendance`, `AcademicYear` | **Corregido el 2026-09-23.** Antes contaba toda la vida escolar del alumno: un alumno de 5º arrastraba sus cinco años, y el número no decía nada del momento (el panel del alumno ya usaba el ciclo). Con el mismo cambio, el **promedio** de la lista sin sección elegida dejó de salir 0 para todos: se calcula en bloque por la sección de cada alumno, con las mismas reglas. Tests: LISTA-01…03. |
| **Sección / Aula** | Asistencia Global de Sección | Media de las asistencias individuales de los estudiantes inscritos activos en el período: AsistSeccion = suma(Asist(s)) / TotalEstudiantes | `getClassroomAttendanceStats` (`apps/backend/src/controllers/attendance.controller.ts`) | `DailyAttendance`, `StudentClassroom` | Días sin toma de asistencia no penalizan el porcentaje. |
| **Sección** | Alumnos con asistencia baja (conteo) | Un alumno cuenta si `(Presentes + Tardanzas) / TotalRegistros * 100 < asistenciaMinima` del liceo (80% por defecto). Un alumno **sin ningún registro** de asistencia **no cuenta**: no hay dato que juzgar. | `getSectionGlobalAverage` (`apps/backend/src/services/cycle-statistics.service.ts`) | `DailyAttendance`, `StudentClassroom` | **Corregido el 2026-09-14.** Antes, cero registros contaba como asistencia baja (el propio comentario del código dudaba: *"Assuming 0 records is bad or neutral?"*), así que el primer día del curso la sección salía con todos sus alumnos "con asistencia baja". Contradecía la fila de arriba. **Resuelto el 2026-09-14.** El 80% ya **no** es fijo: es `asistenciaMinima` en la configuración del liceo (`AcademicConfig`), con 80 como valor de partida. El mismo número manda en el aviso del representante, así que el liceo no tiene dos criterios según la pantalla. Tests: CAL-05, ASI-08. |
| **Panel del representante** | Aviso "Asistencia baja" | Se enciende si `AsistenciaEstudiante < asistenciaMinima` del liceo (80 por defecto), medida **solo sobre el lapso en curso**. **No reprueba, no entra en el promedio y no decide la promoción** — eso es `notaMinimaAprobatoria`, que es otra cosa. | `getTutorDashboard` (`apps/backend/src/services/dashboard.service.ts`) | `DailyAttendance`, `AcademicConfig.asistenciaMinima` | **Añadido el 2026-09-14.** Antes era un `80` escrito a mano en el filtro de alertas. Tests: ASI-01 a ASI-08. |
| **Año y Ciclo Escolar** (estadísticas) | Asistencia del año y del ciclo | **Año** = media simple de sus secciones **que ya pasaron lista** (una sin registros no cuenta como 0 %). **Ciclo** = media de sus años con registros, **pesada por los alumnos** de las secciones con registros. | `getGradeAverage` / `getCycleGlobalAverage` (`cycle-statistics.service.ts`). `getAcademicYearStats` (la tabla por año del ciclo) ya hacía la media solo de las secciones con registros. | `DailyAttendance`, `Classroom` | **Corregido el 2026-10-05.** El ciclo se dividía SIEMPRE entre 5 (un liceo con solo 1.º, todos presentes, salía con 20 %) y daba 0 si aún no había notas; el año contaba como 0 % la sección que no había pasado lista. Tests: ASIS-CICLO-01/02. |
| **Asistencia por QR** (pase de lista del profesor) | Presente o tarde de quien escanea; ausente de quien no escaneó | **Escribe la misma fila que la asistencia a mano** (`DailyAttendance`, una por alumno y día): un alumno registrado por QR y uno marcado a mano cuentan igual en todos los porcentajes de arriba. `PRESENT` si escanea antes de `aTiempoHasta`; `LATE` después. `aTiempoHasta` = apertura del PRIMER pase de esa clase ese día + `asistenciaQr.minutosATiempo` (2 por defecto): cerrar y volver a abrir no da más tiempo. Al cerrar un pase de HOY, quien no quedó aceptado en ningún pase de esa clase y día pasa a `ABSENT`, salvo los que el profesor marque «estaba». Un «por confirmar» no escribe nada hasta que el profesor lo aprueba. | `services/asistencia-qr.service.ts` (`escanearComoAlumno`, `cerrarPase`) | `DailyAttendance`, `pases_de_lista`, `registros_asistencia_qr` | **Añadido el 2026-09-24.** Todo configurable por liceo (`AcademicConfig.asistenciaQr`): radio, fuera del radio (confirmar/bloquear), minutos a tiempo, días para corregir, un teléfono por alumno. En una **corrección** (día pasado) todo es `PRESENT`, no se toca a nadie más al cerrar, y no se pasa del cierre del lapso. Tests: QR-01…14, QRE-01/02. |
| **Clases suspendidas (evento del liceo o profesor)** | Efecto de una clase suspendida en la asistencia | Ninguno. Una `ClassSession` con `status = 'SUSPENDED'` no genera filas de `DailyAttendance`, y todos los porcentajes de asistencia se calculan sobre `DailyAttendance`, nunca contando sesiones. | `applyEventSuspensions` (`apps/backend/src/services/school-events.service.ts`); consumidores: `attendance.service.ts`, `dashboard.service.ts`, `reports.service.ts` | `ClassSession.status`, `DailyAttendance` | **Invariante:** si algún cálculo futuro usa el número de sesiones como denominador ("clases dadas"), debe excluir las `SUSPENDED`; si no, cada evento de todo el liceo hundiría la asistencia. Verificado el 2026-09-10. |

---

## 5. Ocupación y Capacidad

| Pantalla / Componente | Dato Mostrado | Fórmula Exacta | Función / Archivo | Fuente de Datos (Tablas) |
| :--- | :--- | :--- | :--- | :--- |
| **Aulas / Secciones** | Ocupación (X / Y cupos, %) | Ocupacion = (EstudiantesInscritosActivos / CapacidadAula) * 100. **Vigilado por MAPA-07.** | `getClassrooms`, `getAcademicYearStats` | `StudentClassroom` (`isActive: true`), `Classroom.capacity` (por defecto 35) |

---

## 6. Historial y Comparación Histórica (School Archivist)

| Pantalla / Componente | Dato Mostrado | Fórmula Exacta | Función / Archivo | Fuente de Datos (Tablas) |
| :--- | :--- | :--- | :--- | :--- |
| **Perfil de Estudiante / Promoción** | Comparación Histórica de Notas | DeltaPromedio = PromedioActual - AcademicRecord.finalAverage | `closeCycleService.previewPromotion`, `students.controller.ts` | `AcademicRecord` (del año anterior cerrado) vs. `Grade` / `Nivel 2` (del ciclo actual) |

---

## 7. Hallazgos y Discrepancias Identificadas y Resueltas

Durante la auditoría y construcción de este mapa, se contrastaron las fórmulas esperadas contra el código real:

1. **Ponderación (%) en Plan de Evaluación (12.499% vs 12.5%):**
   - *Discrepancia detectada:* El input de ponderación en `EvaluationPlanSection.tsx` utilizaba un divisor `/ 100.00001` con un formateo de punto flotante incorrecto que provocaba `12.499998...%` en lugar de `12.5%`.
   - *Solución aplicada:* La ponderación se derivó directamente de los Puntos con redondeo de 2 decimales: `Math.round((pts / 20) * 100 * 100) / 100`, asegurando coherencia al 100%.

2. **Mapeo de Tema Generador en Clase en Vivo:**
   - *Discrepancia detectada:* `LiveTopicMirrorCard.tsx` y `getLiveTopicsForSection` tenían fallbacks silenciosos a encabezados globales de semanas anteriores cuando el campo `title` de la semana actual estaba vacío, mostrando erróneamente el contenido de `actividadEval`.
   - *Solución aplicada:* Se eliminaron todos los fallbacks cruzados. Cada caja muestra estrictamente su columna correspondiente del plan, y muestra "No hay tema generador registrado" si el campo está vacío.

3. **Preservación de IDs de Filas en Guardado de Plan de Evaluación:**
   - *Discrepancia detectada:* `dbRowsToWeekRows` no propagaba `r.id` a `WeekRow`, provocando que el backend intentara eliminar y recrear filas existentes con calificaciones, arrojando error 400.
   - *Solución aplicada:* Se incluyó `id` y `activityId` en la estructura `WeekRow` y se optimizó `batchUpsertRows` para actualizar por coincidencia de ID o semana protegiendo notas existentes.

4. **Asistencia en Ciclo Escolar y Años Académicos:**
   - *Discrepancia detectada:* En `getAcademicYearStats` (`academic-years.controller.ts`), la propiedad `sumAttendance` se inicializaba en 0 y nunca se consultaba contra la tabla `DailyAttendance`, resultando en `0%` fijo para todos los años y para el ciclo escolar completo.
   - *Solución aplicada:* Se conectó la consulta agregada de `DailyAttendance` por sección y por grado (`PRESENT` + `LATE`), derivando la asistencia del grado como la media de sus secciones con datos, y la del ciclo como la media ponderada de los grados. Asimismo se unificó `getClassroomSubjectsStats` para considerar llegadas tarde (`LATE`) como asistencia válida.

5. **Promedio del lapso en el panel del alumno (media de notas en vez de media de materias):**
   - *Discrepancia detectada:* `dashboard.service.ts` armaba el promedio de cada lapso recorriendo **las filas de notas** del alumno: por cada nota pedía el Nivel 2 de esa materia y lo metía en la lista. Una materia con cinco evaluaciones metía cinco veces el mismo número y una con una, solo una, de modo que las materias con más evaluaciones pesaban más. Medido con un caso de dos materias (Lengua 20 con tres notas, Matemática 10 con una), el panel mostraba **17,5** donde la regla da **15**.
   - *Regla incumplida:* el principio de la sección 1 — cada nivel es la media aritmética de las **entidades** del nivel inferior (una materia, una vez), no de sus filas.
   - *Solución aplicada:* se agrupa por par único (materia, lapso) antes de calcular, y se piden solo las notas del año en curso. Vigilado por `NUM-01` en `tests/integration/decia-hacerlo-y-no-lo-hacia.test.ts`, que comprueba los dos números: que sale 15 y que **no** sale 17,5.

---

## 8. Horarios y Eventos del Liceo

| Vista | Métrica | Fórmula / Regla | Implementación | Modelos | Notas |
|---|---|---|---|---|---|
| **Cualquier vista que cruce fechas con horario** | Día de la semana de una fecha | Una fecha `"YYYY-MM-DD"` se interpreta como **medianoche UTC**, así que su día de la semana se obtiene con `getUTCDay()` (1 = lunes, igual que `ScheduleBlock.dayOfWeek`). En el cliente, "hoy" se forma con la fecha **local** (`getFullYear/getMonth/getDate`), nunca con `toISOString()`. | `dayOfWeekOf` (`school-events.service.ts`), `getClassSessionsByDate` (`scheduleBlocks.controller.ts`), `toYMD` (`apps/web/src/hooks/useSchoolEvents.ts`) | `ScheduleBlock.dayOfWeek`, `ClassSession.date` | **Invariante.** Mezclar `getDay()` (hora local) con fechas UTC desplaza un día en America/Caracas (UTC-4): el historial de Clase en Vivo mostraba el horario del día anterior (corregido el 2026-09-10). También corregidos `getCalendarData` (`evaluation-plan.controller.ts`) y el "hoy" de Clase en Vivo (`toLocalYMD`, `apps/web/src/utils/date.utils.ts`). Quedan por revisar usos de `toISOString().split('T')[0]` en `SubjectScheduleSection.tsx`, `StudentScheduleSection.tsx:134` y `AcademicYearModal.tsx`. |
| **Calendario de Eventos (vista de día)** | Clases por bloque | N(bloque) = número de `ScheduleBlock` tipo `CLASS` con materia asignada, del día de la semana de la fecha, cuya franja se solapa con la del bloque (inicio < fin_bloque y fin > inicio_bloque). | `findClassesInSlot` (`apps/backend/src/services/school-events.service.ts`) | `ScheduleBlock`, `ClassroomSubject`, `Classroom` | **Fuente única:** la misma función alimenta la vista de día, la vista previa del evento ("se suspenderán N clases") y la suspensión real. Las horas `PERSONAL` de los profesores no cuentan como clase. |
| **Evento del liceo** | Clases suspendidas | Por cada par (sección, materia) con al menos una clase en la franja y el alcance → la `ClassSession` de ese día pasa a `SUSPENDED` con `suspendedByEventId`. Borrar o mover el evento revierte exactamente esas sesiones. | `applyEventSuspensions`, `revertEventSuspensions` (`school-events.service.ts`) | `ClassSession`, `SchoolEvent` | La sesión es por sección + materia + **día** (`@@unique`): si una materia tiene dos bloques ese día y el evento cubre uno, se suspende la sesión del día entero. Una clase que un profesor suspendió a mano se respeta y no se revierte al borrar el evento. El evento **no** fusiona el tema generador del plan de evaluación (a diferencia de `suspendClassSession`). |
| **Horario (sección y profesor)** | Bloques restantes por asignación | Restantes(asignación) = `ClassroomSubject.weeklyBlocks` − número de `ScheduleBlock` de esa asignación. | Barra lateral de `ClassroomScheduleEditor` y `TeacherScheduleEditor`; el tope se comprueba también en el servidor (`bulkUpdateTeacherSchedule`). | `ClassroomSubject`, `ScheduleBlock` | El horario de la sección y el del profesor son la misma tabla vista desde dos lados; ambas vistas validan choques con `findScheduleConflicts` dentro de la transacción. |
| **Clase en Vivo** | Dónde se muestra cada actividad | **Clase de hoy**: las de `target: CURRENT` creadas en esa misma clase, y cualquiera cuya fecha de entrega sea la de esa clase. **Próxima clase**: las de `target: NEXT` creadas EN esa clase y con fecha posterior. Una actividad para la próxima clase **no** se anuncia en las clases anteriores. | `getLiveClassDetail` (`classSessions.controller.ts`) | `ClassActivity`, `ClassSession` | **Regla del producto, deliberada.** Anunciarla en todas las clases anteriores llenaría "Próxima clase" de actividades acumuladas, y se perdería el dato de en qué clase se mandó. El día de entrega aparece igual como "Clase de hoy" por su fecha. Un estudiante que faltó ve, al abrir esa clase, lo que se mandó para la siguiente. Tests: `live-class-activities.test.ts`, `auditoria-dia-del-profesor.test.ts`. |
| **Horario (todas las vías de escritura)** | Profesor en un solo sitio | Un profesor no puede tener dos bloques que se solapen el mismo día. Su profesor en un bloque = `ScheduleBlock.teacherId` (hora `PERSONAL`) o, si es clase, `ClassroomSubject.teacherId`. Al guardar solo **bloquea (409)** el choque que el guardado crea o empeora; los choques heredados en bloques no tocados vuelven como avisos. | `analyzeScheduleConflicts` (`schedule-conflicts.service.ts`). Vías que la aplican: guardar horario de sección y de profesor; asignar profesor a una materia (`assignTeacherToSubject`) y a todo un año (`assignSubjectToGrade`, comprueba todas las secciones antes de tocar ninguna) vía `findTeacherAssignmentConflicts`; generador automático (`autoGenerateSchedule`). | `ScheduleBlock`, `ClassroomSubject` | **Invariante.** Corregido el 2026-09-10: asignar profesor no miraba sus bloques ya colocados, y el generador no veía las horas personales y, si no encontraba hueco, colocaba la clase igual (`pool.pop()`). Así entraron los 50 choques del ciclo 2026-2027 del instituto de pruebas. Ahora el generador deja la franja vacía y devuelve `unplaced`. Tests: `schedule-conflict-doors.test.ts`. |

| **Clase en Vivo (calificar)** | Alumno evaluado de otra forma | Por actividad y alumno, `ClassActivity.evaluadoDeOtraForma[studentId] = { metodo, motivo? }` (p. ej. «Cuaderno» para quien no puede hacer deporte). **No cambia ningún cálculo**: su nota va en `scores` como la de los demás y cuenta con el mismo peso; lo que queda es el método. Se escribe en una sola sentencia jsonb (como las notas). | `evaluarDeOtraForma` (`classSessions.controller.ts`), `PUT/DELETE /sessions/activities/:id/otra-forma/:studentId`; lo ven el alumno y su representante en `miClase` y `actividadesDelAlumno` (solo lo suyo) | `ClassActivity.evaluadoDeOtraForma` | Añadido el 2026-09-25. Solo el profesor de esa clase o el admin; solo alumnos de la sección. Tests: OTRA-01…05, OTRA-UI-01. |
| **Plan, Clase en Vivo, Horario en vivo, Calendario, Mi clase** | Semana del plan de una fecha | Lapso = el de la fecha (`lapsoDeLaFecha`); su plan = `EvaluationPlanMetadata` de ESE lapso. Inicio del plan = `fechaDesde` del plan, si no `Period.inicioDelPlan`, si no el inicio del lapso, si no (año sin lapsos) el inicio del año. Antes del inicio → **semana 0** (`antesDelPlan`, se llama `nombreAntesDelPlan` o «Diagnóstico»); desde él, semanas alineadas a lunes (`planWeekNumberFromRange`). Semanas del lapso = ⌈(fin del lapso − inicio del plan) / 7 días⌉. | `semanaDelPlanCon` / `semanaDelPlan` (`services/semana-del-plan.service.ts`); la usan `getLiveClassDetail`, `getLiveOverview`, `getPlanWeekNumber` (guardar fila de la semana, fusionar tema al suspender), `getCalendarData`, `getEvaluationPlanMetadata` y `miClase` | `Period.inicioDelPlan`, `Period.nombreAntesDelPlan`, `EvaluationPlanMetadata`, `EvaluationPlanRow` | Añadido el 2026-09-25. Antes cada vista contaba a su manera: la rejilla desde el lapso, la clase en vivo desde el AÑO (en el 2º y 3er lapso la «Semana N» no coincidía) y buscaban el plan sin lapso. En semana 0 no se puede guardar la fila de la semana (400 `ANTES_DEL_PLAN`). Tests: SEMANA-01…05, PLANINI-01…06, PLANINI-UI-01. |
| **Configuración → Horario / todo el horario** | Franjas del día (horas y recreos) por turno | Por turno (MANANA, TARDE) el admin pone **inicio**, **fin**, **duración** de la hora de clase y sus **recreos** (después de qué hora, cuántos min). Horas = ⌊(fin − inicio − Σ recreos) / duración⌋; **se guarda solo si sobra 0** (si no, 400 con cuánto sobra y a qué hora acabar), si hay entre 1 y 15 horas, si ningún recreo va después de la última hora, y si la tarde no empieza antes de que acabe la mañana. Si al cambiarlo alguna clase puesta deja de caer en una hora del día, 409 y se confirma. INTEGRAL usa la mañana. | `calcularTurno`, `erroresDelHorario`, `franjasDelTurno` (`apps/backend/src/utils/franjas-del-horario.ts`, copia en `apps/web/src/lib/`); `updateInstituteConfig`; `useSchedulePeriods`; `autoGenerateSchedule` | `Institute.academicConfig.schedule` (plataforma) | Añadido el 2026-09-25. Antes el fin no se podía poner (salía de la cuenta), la tarde empezaba a las 13:00 fijas y el generador automático tenía las horas de la mañana escritas a mano. Lo guardado a la vieja (solo la mañana) se lee igual: la tarde, 13:00 con las mismas horas. Tests: FRANJA-01…07 (servidor y web), HORARIO-API-01…06, HORARIO-CFG-01. |
| **Clase en Vivo / Horario en vivo** | Reemplazo de una clase suspendida | El admin pone otra materia M de la sección en el hueco de una clase **suspendida** ese día. Se crea un `ClassReplacement` por cada bloque de la materia suspendida ese día de la semana. Solo si: M tiene profesor activo; ese profesor no tiene a esa hora ese día un bloque `CLASS` (salvo que esa clase también esté suspendida ese día), ni una hora `PERSONAL`, ni otro reemplazo; y el hueco no está cubierto. Suspender + reemplazar es todo o nada. | `crearReemplazo` (`class-replacements.service.ts`); se muestra en `StudentScheduleSection.tsx` | `ClassReplacement`, `ClassSession`, `ScheduleBlock` | Añadido el 2026-09-16. El horario semanal no cambia. La clase que se da es la `ClassSession` normal de M ese día. Borrar el evento que suspendió la clase borra el reemplazo. Tests: `reemplazar-clase-suspendida.test.ts`. |

---

## 8b. Pagos

Todo el dinero se cuenta en **céntimos enteros**. Implementación: `apps/backend/src/services/pagos.service.ts` (funciones puras) y `pagos.controller.ts`. Tests: `src/tests/services/pagos.service.test.ts` (PAG-01…16), `tests/integration/pagos.test.ts` (PAGOS-01…12).

| Métrica | Regla | Notas |
|---|---|---|
| Cuotas del ciclo | **Mensual:** una por mes del mes de inicio al de cierre del ciclo, vence el día configurado (1–28). **Quincenal:** dos por mes, el día configurado y 15 días después. **Por lapso:** una por `Period`, vence al empezar el lapso. **Inscripción** (si activa): una, vence el día de inicio del ciclo. | El vencimiento se encierra entre inicio y cierre del ciclo; en meses cortos va al último día. Con `dueMode = PER_STUDENT` se usa el día del plan del alumno. |
| Cuota vencida | hoy (fecha del liceo, `school-time`) **>** vencimiento + días de gracia | El mismo día del vencimiento aún no se debe. |
| Estado de una cuota | `PAGADA` (pendiente 0) · `VENCIDA` (pendiente > 0 y vencida) · `ABONADA` (algo pagado, no vencida) · `PENDIENTE` · `EXONERADA` | Lo pagado de más en una cuota no pasa a la siguiente. |
| Estado del alumno | `EXONERADO` si su plan lo dice · `ANO_PAGADO` si lo pagado = total · `DEBE` si hay ≥1 cuota vencida · si no, `AL_DIA` | "N estudiantes deben" = inscritos activos del ciclo activo en estado `DEBE`. Deuda = suma de lo pendiente de las cuotas vencidas. |
| Reparto de un pago | Se convierte a moneda base (`VES→USD`: monto / tasa; `USD→VES`: monto × tasa, redondeado al céntimo) y se reparte entre las cuotas elegidas **de la más vieja a la más nueva**; lo que no completa la última queda como abono. | Rechaza: monto mayor que lo pendiente de las elegidas, cuota ya pagada, fecha futura, moneda o método no configurados, alumno exonerado o no inscrito. Un candado por alumno (`pg_advisory_xact_lock`) evita cobrar dos veces la misma cuota a la vez. |
| Pagos anulados | No cuentan para nada. No se borran: quedan con motivo, fecha y quién. | |
| Cambios de configuración | El monto se puede cambiar (afecta lo pendiente de todas las cuotas del ciclo). La **frecuencia** no, si hay pagos no anulados en el ciclo activo (409). | |
| Configuración de cada ciclo (2026-10-01) | Cada ciclo calcula sus cuotas con **su** configuración (`ajustes_de_pagos_del_ciclo`): se copia la del liceo al primer pago del ciclo (o al guardar la configuración con él en curso) y desde ahí no cambia aunque cambie la del liceo. Guardar en Configuración → Pagos cambia el ciclo **en curso** y lo que llevarán los ciclos nuevos. | Antes, subir la cuota recalculaba los ciclos pasados. Un ciclo `COMPLETED` se ve, no se toca: cobrar, anular o cambiar un plan en él da 409 `CICLO_CERRADO` (PAGOS-CICLO-01…04). |
| Becas y descuento por hermanos (2026-10-01) | Cada cuota × (100 − d) / 100, redondeado al céntimo, con d = el **mayor** entre la beca del alumno (`descuentoPct`, con motivo) y el de hermanos del ciclo (desde el 2.º hijo del mismo representante, ordenados por cédula). No se suman. | BECA-01, BECA-05. |
| Recargo por mora (2026-10-01) | Una vez por cuota: si hoy > vencimiento + gracia + `moraDiasDespues` y la cuota no estaba completa a esa fecha (último pago después, o falta algo). FIJA: el monto; PORCENTAJE: cuota × valor / 10000 (`moraValor` en centésimas de punto). Se suma a lo que vale la cuota. Al exonerado, nunca. | BECA-02…04. Se calcula, no se guarda. |
| El ciclo mes a mes (calendario) | Cada cuota cuenta en el mes de su **vencimiento**: esperado = suma de sus montos (sin exonerados); cobrado = lo repartido a ellas; «deben» = estudiantes con alguna cuota de ese mes `VENCIDA`. El día: cuotas que vencen ese día y pagos con `paidAt` ese día (no anulados). | `GET /api/payments/overview` (`months`) y `GET /api/payments/month`. |
| Recordatorio de cuota (2026-10-01) | Se avisa al representante de cada cuota no exonerada con algo pendiente que vence **después de hoy y hasta hoy + `recordatorioDiasAntes`** (3 por defecto; 0 = no se avisa). Una sola vez por alumno, ciclo y cuota (`recordatorios_de_cuota`, único). | La tarea corre al arrancar y cada 6 h; un día perdido no deja cuotas sin aviso. RECORDAR-01/02. |
| Pago reportado (2026-10-01) | No cuenta para nada hasta que el admin lo confirma; al confirmar se cobra con las mismas reglas que «Registrar pago» (lo de arriba). Rechazar exige motivo. | Dos confirmaciones a la vez: una cobra, la otra 404/409 (REPORTAR-03). |

---


### Reconversión monetaria (2026-10-05)

Cuando el bolívar pierde ceros, `npm run reconvertir -- --liceo=<slug> --factor=<10^n> [--aplicar]` (`reconversion.service.ts`) pasa todo lo guardado al cono nuevo en una transacción: monto en VES ÷ factor (a 2 decimales), toda tasa Bs/USD ÷ factor (mínimo 0,0001), monto en la base cuando la base de la fila es VES ÷ factor (sin tasa, la base es su moneda; con tasa, la otra). Configuración (cuota, inscripción, mora **FIJA**) y nómina, si la base del liceo es VES. Lo que está en dólares no se toca; la mora en % tampoco. Sin `--aplicar` solo cuenta. Tests: RECONV-01…03.

## 8g. Las finanzas del liceo (fondos, gastos y nómina)

Implementación: `apps/backend/src/services/finanzas.service.ts` (cuentas puras) y `controllers/finanzas.controller.ts`. Tests: `src/tests/services/finanzas.service.test.ts` (NOMINA-C-01…06), `tests/integration/finanzas.test.ts` (FIN-01…04, NOMINA-01…06), `tests/e2e/finanzas.spec.ts`. Todo en céntimos y en la moneda base del liceo; nada se borra: se anula con motivo.

| Métrica | Regla | Notas |
|---|---|---|
| Fondos disponibles | Σ fondos agregados + Σ cuotas cobradas − Σ pagos al personal − Σ gastos, **desde siempre**, sin anulados. | El saldo con que el liceo empieza va como fondo `SALDO_INICIAL`. |
| Pagos que se le deben a una persona | **Mensual:** uno por mes del ciclo, su día (o el del liceo; un día que el mes no tiene = el último). **Quincenal:** el 15 y el último día. **Único:** uno, en su fecha. El monto es el de CADA pago. | Lo que la persona no tiene propio lo toma del liceo (`ajustes_de_nomina`). |
| Vacaciones | Los meses que el liceo marca (agosto por defecto). Si no cobra en vacaciones (suyo o del liceo), esos meses no tienen pago. | |
| Bono vacacional | Un pago más si hay monto (suyo o del liceo), en su fecha, la del liceo o el día 1 del primer mes de vacaciones. | Sin meses de vacaciones ni fecha, no hay bono. |
| Atrasado | hoy > fecha del pago y falta algo. | |
| Pagar | Se reparte de lo más viejo a lo más nuevo; lo que no completa el último queda como abono. Rechaza: pagado ya, monto de más, sin acuerdo, fecha futura, ciclo cerrado. Candado por persona (`pg_advisory_xact_lock`). | Cambiar la frecuencia con pagos hechos en el ciclo: 409. |
| Ciclo nuevo | Al abrir su nómina sin acuerdos, se copian los del ciclo anterior de quien tiene «guardar para los próximos ciclos» (menos los pagos únicos y las fechas de bono). Sin duplicar. | Los profesores con cuenta aparecen solos, sin sueldo. |
| Mes a mes | Entra = cuotas cobradas (por `paidAt`) + fondos (por fecha); sale = pagos al personal + gastos (por fecha). | |
| Reporte del mes (2026-10-01) | Saldo al empezar = fondos disponibles contando solo lo fechado **antes** del día 1; final = inicial + entró − salió. «Deben» = la deuda de los estudiantes del ciclo al último día del mes (o a hoy, si el mes no acabó). | El final del mes en curso = fondos disponibles de hoy; el final de un mes = el inicial del siguiente (REPORTE-01). |

---

## 8h. El cuadro de honor (2026-10-04)

Implementación: `services/reglas-del-cuadro.ts` (cuenta pura), `services/cuadro-de-honor.service.ts` (la foto) y `jobs/cuadro-de-honor.job.ts`. Tests: `src/tests/reglas-del-cuadro.test.ts` (CUADRO-01…03), `tests/integration/cuadro-de-honor.test.ts` (CUADRO-04…08).

| Métrica | Regla | Notas |
|---|---|---|
| Promedio | El **de la boleta** (`boletaDelAlumno`): por lapso, la media de las materias del lapso; del ciclo, el definitivo. Sin apreciaciones (`NOTAS_QUE_CUENTAN`), con el redondeo del liceo. | Sin notas en el período, el alumno no entra en el cuadro de ese período. |
| Asistencia | Presentes + retardos / días con asistencia registrada, **entre las fechas del período** (lapso o ciclo). Sin registros, 100 %. | Antes se contaba toda la vida. |
| Observaciones | Las del período (por su `date`), menos las felicitaciones (`TIPOS_QUE_NO_RESTAN`: `POSITIVE`, `FELICITACION`…; CUADRO-09). | El tipo es libre; si el liceo no las usa como llamados de atención, pone la resta en 0. |
| Puntaje | `pesoNotas × promedio/20 + pesoAsistencia × asistencia/100 − restaPorObservacion × observaciones`, a una décima, nunca menos de 0. | Pesos del liceo (`AcademicConfig.cuadroDeHonor`), 80 / 20 / 5 por defecto. |
| Puesto | Por puntaje; empate → mejor promedio → mejor asistencia; empate en las tres → **mismo puesto** (1, 2, 2, 4). En el liceo y dentro de su año. | No se desempata por el nombre. |
| La foto | Una por sábado (el último sábado según la hora del liceo), única por alumno, ciclo, alcance y fecha. La tarea mira al arrancar y cada 6 h; si falta la del último sábado, la saca. | Lapsos que no han empezado, fuera. |
| «Subió N» | Puesto **en su año** en la foto anterior − puesto en la última. | Al alumno y al representante: su puntaje y esto. Nunca el puesto ni a los demás. |

---

## 8c. El fin del año escolar (cierre)

**Rehecho el 2026-09-26** (`services/promotion/close-cycle.service.ts`, `services/fin-de-ano.service.ts`,
`services/revision.service.ts`; pantalla `/dashboard/academico/<año>/cierre`). Todas las reglas son del
liceo (`academicConfig`, `reglas-del-fin-de-ano.ts`); lo del MPPE es el valor por defecto.

| Qué | Regla | Configurable |
| :--- | :--- | :--- |
| **Definitiva de la materia** | Media de los lapsos con notas, con el redondeo del liceo (MPPE: 0,50 sube). Las materias con apreciación no cuentan (§1b). | `redondeoDeDefinitivas` |
| **Revisión** | Solo de una materia reprobada con notas. Nota = Σ (nota de cada parte × peso) ÷ 100, redondeada como las definitivas; pasa a ser la definitiva. La pone el profesor de la materia en esa sección (o el admin). Quien reprobó más materias que el tope no va a revisión (409 `FUERA_DE_REVISION`). | `revision.componentes` (por defecto una sola parte, 100 %), `revision.maxMaterias` (vacío = todas) |
| **Reprobadas que cuentan** | Materias con notas por debajo de la mínima tras la revisión + (si `pendienteNoAprobada = SIGUE_PENDIENTE`) las pendientes de antes sin aprobar. | `notaMinimaAprobatoria` |
| **Condición sugerida** | 0 → PROMOVIDO; más que el tope → NO_PROMOVIDO; en el último año con reprobadas: REPITE → NO_PROMOVIDO, SOLO_PENDIENTES/EGRESA → PROMOVIDO_CON_PENDIENTES; pendiente de antes sin aprobar con `pendienteNoAprobada = REPITE` → NO_PROMOVIDO. | `maxMateriasPendientesParaPromover` (2), `ultimoAnoConPendientes` (REPITE; el booleano viejo `permitePendientesEnUltimoAno: true` se lee EGRESA), `pendienteNoAprobada` (REPITE) |
| **Decisión del admin** | Puede ser otra que la sugerida **solo con motivo** (400 `FALTA_EL_MOTIVO`); queda en el expediente junto a la sugerida (`condicionSugerida`, `motivo`, `decididaPor`). | — |
| **Destino** | NO_PROMOVIDO → repite su grado (también 5to: antes egresaba igual); último año que no repite → no va a sección: `egreso = EGRESADO`, o `PENDIENTE` si SOLO_PENDIENTES; los demás → grado + 1. | — |
| **Materias pendientes** | Con PROMOVIDO_CON_PENDIENTES, una `MateriaPendiente` por reprobada, en el año siguiente, con la nota de origen y el profesor que da esa materia en ese grado ese año. Las de antes sin aprobar quedan NO_APROBADA y nacen otra vez en el siguiente. | `pendientes.momentos` (4) |
| **Aprobar una materia pendiente** | La evalúa el profesor asignado (o el admin), momento a momento y en orden, con notas de 0 a 20 redondeadas como las definitivas. MOMENTO_APROBADO: aprobada en el primer momento con la mínima, esa es su nota final y no hay más momentos; con todos los momentos sin llegar: NO_APROBADA con la mejor. PROMEDIO: con todos los momentos, la media (redondeada) decide. Corregir o quitar el último momento recalcula el estado. | `pendientes.momentos` (4), `pendientes.formaDeCalificar` (MOMENTO_APROBADO) |
| **Año siguiente** | Ya no se inventa al cerrar (antes: un mes después, un solo lapso de 90 días): sin él, 409 `SIN_ANO_SIGUIENTE`. Se crea en el paso 5 con el calendario del MPPE (`calendario-mppe.ts`) y copiando secciones (capacidad), materias (horas) y, si se pide, profesores y horarios. Una sección de destino que falte se crea copiando la del mismo grado de este año, no con valores fijos. | — |
| **Corregir tras cerrar** | Rehace expediente (con motivo, quién y cuándo), matrícula del año siguiente y pendientes nacidas de este año (las ya evaluadas se quedan); queda en `audit_logs`. | — |

Pruebas: CIERRE-01…10, academic-close 1…9, CIERRE-UI-01/02; la pendiente: PEND-01…08, PEND-UI-01 (`materias-pendientes.service.ts`).

**La definitiva, en bloque (2026-10-06).** `prepareClose` ya no pide el promedio alumno por
alumno, materia por materia y lapso por lapso (`promedioDeLaMateria`: unas 18.000 cuentas con
600 alumnos, 47 s en frío). Saca el de cada lapso por sección con `bulkSubjectAveragesConDatos`
(las mismas reglas: niveles 0-2, notas traídas, alumnos que cambiaron de sección) y aplica la
misma definitiva: cada lapso con notas redondeado según `redondeoDeDefinitivas`, su media a dos
decimales y otra vez el redondeo (`definitivaDeLaMateria`). **Ninguna regla cambia.** Paridad
medida con los datos del instituto de pruebas: 0 diferencias en 8.985 materias de 599 alumnos;
1,8 s en vez de 61 s. Sin lapsos en el año, la cuenta de siempre.

---

## 8d. La labor social (horas comunitarias)

**Añadido el 2026-09-27** (`services/labor-social.service.ts`; la cuenta pura, `avanceDe`, en
`promotion/reglas-del-fin-de-ano.ts`). Reglas del liceo en `academicConfig.laborSocial`.

| Qué | Regla | Configurable |
| :--- | :--- | :--- |
| **A quién le toca** | Alumnos inscritos este año en los grados del liceo, con la labor social activa. | `grados` ([último año]), `activa` (sí) |
| **Avance** | Suma de las horas de TODAS sus actividades (de cualquier año). Con horas: cumplida si la suma ≥ las requeridas. Con 0 horas (por proyecto): cumplida si alguna actividad culmina el proyecto. Una actividad va de más de 0 a 24 h. | `horasRequeridas` (60; 0 = por proyecto) |
| **Para egresar** | En el cierre del último año, al que egresaría: BLOQUEA → `egreso = PENDIENTE` sin ella; AVISA → egresa, con aviso en la sugerencia (lo del MPPE: un retraso no niega el título); NO → no cuenta. También al corregir tras cerrar. | `paraEgresar` (AVISA) |
| **Constancia** | Solo con la labor social cumplida (409 `LABOR_SOCIAL_NO_CUMPLIDA`), con sus horas y su proyecto. | — |

La anotan el admin y el profesor guía de la sección del alumno (una actividad a varios a la vez);
el alumno y su representante solo la ven. Pruebas: LABOR-01…07, LABOR-UI-01.

## 8e. Los documentos oficiales (resumen final y certificación)

**Añadido el 2026-09-27** (`services/resumen-final.service.ts`, `services/certificacion.service.ts`,
`services/plantillas-de-documentos.service.ts`).

| Qué | Regla | Configurable |
| :--- | :--- | :--- |
| **Resumen final, tipos** | FINAL: la definitiva de cada área (promedio de los lapsos del año). REVISIÓN: solo los alumnos con revisión, con su nota de revisión. MATERIA PENDIENTE: una columna por área y grado de origen, con la nota de la pendiente. | — |
| **Abreviatura del área** | La del plan de estudio del MPPE si el nombre es uno de los suyos (CA, MA, FI…); si no, el código del liceo si son 2–5 letras; si no, las iniciales. Repetidas: la segunda lleva un número. | el código de la materia |
| **Certificación** | Por grado, de 1.º al último: si se cursó en el liceo, sus definitivas con el tipo (F, R o MP) y la fecha MM/AAAA; si en otro plantel, lo cargado a mano; si no, «sin datos». | — |
| **Constancias** | Texto de cada tipo desde la plantilla del liceo (marcadores `{{…}}`); sin plantilla propia, la del MPPE. Un marcador desconocido no se guarda (400). | Configuración → Documentos |

Pruebas: DOC-01…08, DOC-UI-01…03.

---

## 8f. La estadística de matrícula (el movimiento)

**Añadido el 2026-09-28** (`services/matricula.service.ts`). Reglas del liceo en
`academicConfig.matricula`.

| Qué | Regla | Configurable |
| :--- | :--- | :--- |
| **Matrícula inicial** | Quien estaba inscrito al empezar el período y no se había ido. Lo inscrito en los primeros días del año es inicial del año, no ingreso. | `diasDeInscripcion` (30) |
| **Ingresos** | Inscritos dentro del período (después de esos primeros días). | — |
| **Retiros** | `student_classrooms.retiradoEl` dentro del período (lo pone el retiro de la ficha); si se archivó antes de existir, el día del archivo. | — |
| **Final** | Inicial + ingresos − retiros. Por sexo (M, F; sin sexo cuenta en el total, «sin dato»). | — |
| **Por edad** | La matrícula final, por edad cumplida en la fecha de corte. Sin fecha de nacimiento: «sin dato». | `fechaDeCorte` («09-30») |

Pruebas: MAT-01…04, MAT-UI-01.

---

## 9. Estas reglas están vigiladas, no solo escritas

Un documento como este **envejece en silencio**: alguien cambia una fórmula, el
papel se queda como estaba, y a partir de ahí dice una cosa y el sistema hace
otra. Nadie se entera hasta que una familia pregunta por qué su hijo aparece
reprobado.

`apps/backend/tests/integration/el-mapa-de-calculos-es-verdad.test.ts` coge las
reglas de aquí y las comprueba **contra el sistema de verdad**: calcula el número
a mano desde la base, se lo pregunta al sistema, y tienen que coincidir.

| Prueba | Regla de este documento |
|---|---|
| MAPA-01 | Riesgo académico: en riesgo son los que están **por debajo** de la nota mínima |
| MAPA-02 | Justo **en** la nota mínima NO está en riesgo (es "menor que", no "menor o igual") |
| MAPA-03 | Si el liceo cambia la nota mínima, el riesgo cambia con ella |
| MAPA-04 | Asistencia: la **tardanza cuenta** como asistencia |
| MAPA-05 | Los días sin toma de asistencia **no penalizan** |
| MAPA-06 | Un alumno **sin ningún registro** no cuenta como asistencia baja |
| MAPA-07 | Ocupación: solo los inscritos **activos**, contra la capacidad del aula |
| MAPA-08 | El promedio de la sección **cuadra** con el de sus alumnos |
| MAPA-09 | Un alumno sin notas **no arrastra** el promedio hacia abajo |
| MAPA-10 | Plan de evaluación: si suma 20, se guarda |
| MAPA-11 | Si no suma 20, se rechaza **y se dice cuánto suma** |
| MAPA-12 | Se respeta la tolerancia de centésimas (`<= 0.009`) de la sección 2 |

Cambiar una fórmula sin cambiar este documento **rompe la tanda de pruebas**. Que
es exactamente lo que se busca.
