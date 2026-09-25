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
| **Ciclo Escolar** | Asistencia del Ciclo Escolar | Media ponderada o simple de la asistencia de las secciones activas. | `getAcademicYearStats` (`apps/backend/src/controllers/academic-years.controller.ts`) | `DailyAttendance`, `Classroom` | |
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
