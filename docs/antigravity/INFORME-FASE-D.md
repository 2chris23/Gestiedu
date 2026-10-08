# Informe de Implementación y Verificación de la Fase D: Las Pantallas del Profesor

Fecha: 2026-10-08  
Rama: `trabajo/integracion-nube`  
Commit base: `7ebabe1`  
Estado: COMPLETADA, VERIFICADA Y CON PRUEBAS EN VERDE  

---

## 1. Resumen de la Implementación

En cumplimiento del encargo especificado en `docs/antigravity/ENCARGO-2026-10-precarga-y-roles.md` (Fase D) y la instrucción complementaria sobre asistencia sin registros, se ejecutaron las siguientes modificaciones arquitectónicas y funcionales:

### 1.1. Asistencia sin registros: valor nulo («—») en backend y frontend
- **Backend:**
  - `academic-years.controller.ts`: En `getAcademicYearStats`, si el total de registros de asistencia en el rango de fechas del lapso o ciclo es 0, `attendance` devuelve `null` en lugar de `0`.
  - `classrooms.controller.ts`: En `getClassroomStats`, si el conteo total de registros de asistencia (`totalCount`) es 0, se devuelve `attendance: null` y `attendancePercentage: null`.
  - `classroomSubjects.controller.ts`: En `getClassroomSubjectDetail`, si `attendanceRecords.length === 0`, el campo `attendance` devuelve `null`.
- **Frontend:**
  - `apps/web/src/components/academic/AcademicStats.tsx`: El campo de asistencia acepta `number | null`. Si el valor es `null` o `undefined`, se renderiza «—» en lugar de «0 %» (idéntico al comportamiento del promedio sin notas).
  - `apps/web/src/components/academic/SubjectCard.tsx`: Si `attendance` es `null`, muestra «—» en la tarjeta de materia.
  - `tests/e2e/selector-de-lapso.spec.ts`: Ajustadas las aserciones de E2E para esperar «—» (conteo de 2 ocurrencias: promedio y asistencia) y no «0%» en lapsos sin registros.

### 1.2. Módulo Académico (`/dashboard/academico/**`)
- **Filtros en el servidor:**
  - `academic-years.controller.ts`: En `getAcademicYears`, si el usuario es `TEACHER`, la consulta filtra los ciclos escolares (`AcademicYear`) donde el docente impartió clases en alguna sección (`classrooms.some.subjects.some.teacherId = userId`) o fue asignado como profesor guía (`classrooms.some.teacherId = userId`). No se limita al ciclo activo: incluye ciclos cerrados o archivados donde tuvo asignación.
  - `classrooms.controller.ts`: En `getClassrooms`, para usuarios con rol `TEACHER`, se devuelven exclusivamente las secciones donde el profesor es guía (`teacherId = userId`) o imparte al menos una materia (`subjects.some.teacherId = userId`), conforme al estándar establecido en `tests/integration/las-secciones-que-me-tocan.test.ts`.
  - `classroomSubjects.controller.ts`:
    - En `getClassroomSubjects` y `getClassroomSubjectsStats`, cuando el rol es `TEACHER`, la consulta a la base de datos restringe los resultados a `teacherId = request.user.userId`. El profesor no recibe materias impartidas por otros docentes dentro de la sección.
    - En `getClassroomSubjectDetail`, si un docente intenta acceder directamente por URL al detalle de una materia asignada a otro profesor (`existingAssignment.teacherId !== request.user.userId`), el endpoint deniega la petición respondiendo con código HTTP `403 Forbidden` (`AppErrors.Forbidden('Solo el profesor asignado a esta materia o el administrador pueden acceder')`).
- **Restricción de mutación en frontend (solo lectura para docentes):**
  - `apps/web/src/app/(dashboard)/dashboard/academico/page.tsx`: El botón «Nuevo ciclo» está reservado exclusivamente para administradores (`isAdmin`).
  - `apps/web/src/components/academic/GradeAccordion.tsx`: Se ocultan los botones de «+ Crear» sección, «+ Agregar primera sección» y los menús de tres puntos de edición/eliminación de sección para usuarios no administradores.
  - `apps/web/src/app/(dashboard)/dashboard/academico/[cycleId]/page.tsx`: Se retiran los controles de gestión del ciclo escolar (menú de edición, finalizar ciclo) para docentes.
  - `apps/web/src/app/(dashboard)/dashboard/academico/[cycleId]/[sectionId]/page.tsx`: Se ocultan los botones de «Asignar Materia», «Asignar Primera Materia», «Nuevo Estudiante» y «Asignar Profesor Guía» para docentes.
  - En el ciclo activo, la clase del docente preserva intacta la funcionalidad de registro de evaluaciones y toma de asistencia en sus materias.

### 1.3. Pantalla «Mi sección guía» (`/dashboard/mi-seccion-guia`)
- **Backend:**
  - Creados `apps/backend/src/services/cuadro-general.service.ts` y `apps/backend/src/controllers/cuadro-general.controller.ts`.
  - Endpoints registrados en `apps/backend/src/routes/classrooms.routes.ts`:
    - `GET /api/classrooms/mis-secciones-guia`: Devuelve las secciones activas o del ciclo donde el usuario autenticado figura como profesor guía (`teacherId = userId`).
    - `GET /api/classrooms/:id/cuadro-general`: Devuelve la estructura tabular completa de la sección guía (estudiantes ordenados alfabéticamente por apellido y nombre, lista de materias con indicador de si es propia o ajena, y matriz de promedios calculados por lapso o ciclo completo).
  - **Seguridad y permisos:** Valida `assertCanSeeClassroom` y restringe el acceso: si el usuario es `TEACHER` y no es el profesor guía de la sección solicitada, responde con `403 Forbidden`.
  - **Optimización de consultas:** Los promedios se calculan por lote utilizando `bulkSubjectAveragesConDatos`, ejecutando consultas por lote sin incurrir en problema de consultas N+1.
- **Frontend:**
  - Creada la página `apps/web/src/app/(dashboard)/dashboard/mi-seccion-guia/page.tsx`:
    - Selector interactivo de secciones guía asignadas al docente.
    - Selector de lapsos (Primer Lapso, Segundo Lapso, Tercer Lapso, Año Completo).
    - Tarjetas superiores de resumen métrico: Estudiantes inscritos, Materias impartidas, Promedio general de la sección y Alumnos en riesgo.
    - Cuadro general de calificaciones: Cada celda muestra la nota numérica redondeada a un decimal o el estado cualitativo correspondiente. Las materias ajenas se muestran en modo estrictamente de solo lectura (sin botones para calificar ni enlaces de navegación a clase en vivo). Las materias propias del docente incluyen una etiqueta distintiva «Tu materia».
    - Estado vacío explicativo con retroalimentación clara si el docente no tiene secciones asignadas bajo su tutoría.
- **Navegación:**
  - Actualizado `apps/web/src/lib/el-menu.ts` para incorporar «Mi sección guía» en la navegación lateral del profesor.
  - Actualizado `apps/backend/src/services/paquete-de-precarga.service.ts` para sincronizar las rutas del menú en el paquete descargable de precarga.

### 1.4. Módulo de Horarios (`/dashboard/horarios`)
- **Backend:**
  - `scheduleBlocks.controller.ts`:
    - En `getTeacherScheduleBlocks` y `getTeacherClassroomSubjects`: Se incorporó validación estricta de identidad. Si un usuario con rol `TEACHER` intenta consultar los bloques o materias de otro docente (`request.user.userId !== teacherId`), el servidor responde inmediatamente con código HTTP `403 Forbidden`.
    - Rutas de escritura protegidas: Las mutaciones de horarios (`POST /api/schedules/teacher/:teacherId/bulk`, `POST /api/schedules/teacher/:teacherId/auto-fill`, `POST /api/schedules/personal-blocks`) están blindadas con `preHandler: [requireRole(['ADMIN'])]`. Cualquier intento de mutación por parte de un docente es rechazado con `403 Forbidden`.
- **Frontend:**
  - `apps/web/src/app/(dashboard)/dashboard/horarios/page.tsx`: Si el usuario autenticado es `TEACHER`, la página redirige automáticamente e inmediatamente a su horario personal `/dashboard/horarios/profesor/${yo.id}`, evitando parpadeos de vistas administrativas.
  - `apps/web/src/app/(dashboard)/dashboard/horarios/profesor/[teacherId]/page.tsx`:
    - Si un profesor intenta visitar la URL de otro docente, es redirigido a su propia vista.
    - Se pasa la propiedad `readOnly={esProfesor}` a `TeacherScheduleEditor`.
    - El enlace de retorno se ajusta dinámicamente: para profesores muestra «Volver al Inicio» apuntando a `/dashboard`.
  - `apps/web/src/components/schedule/TeacherScheduleEditor.tsx`:
    - Soporte completo del modo `readOnly`: Deshabilita `@dnd-kit/core` (sensores e interactividad de arrastre desactivados, sin renderizado de `DragOverlay`).
    - En la barra lateral: Se ocultan los botones de acción «Ordenar al azar» y «Guardar Cambios». Se presenta una lista estática de materias asignadas y cómputo de horas.
    - En las celdas de la cuadrícula (`DroppableCell`): Se oculta el botón `+` para añadir horas personales, se oculta el botón `X` de remover asignaciones y se bloquea la apertura del diálogo de edición de horas personales.
    - No se monta el componente `PersonalBlockModal`.

### 1.5. Aislamiento de Observaciones en el Servidor
- `apps/backend/src/controllers/observations.controller.ts`:
  - En `getClassroomObservations`: Para usuarios `TEACHER`, se consulta el aula en base de datos. Si el profesor no es el guía de la sección (`cls.teacherId !== request.user.userId`), se restringe el filtro de consulta imponiendo `where.createdById = request.user.userId`. El docente solo tiene visibilidad de las observaciones que él mismo generó.
  - En `getSubjectObservations`: Cuando el solicitante es `TEACHER`, se impone `whereSubject.createdById = request.user.userId`.
- `apps/backend/src/services/citaciones.service.ts`:
  - En `observacionesDelPanel`: Para el rol `TEACHER`, se determinan las secciones donde es profesor guía. La cláusula `OR` permite visualizar únicamente las observaciones creadas por él (`createdById: quien.id`) o las observaciones de las secciones donde ejerce de profesor guía (`classroomId: { in: seccionesGuia }`). No tiene acceso a observaciones ajenas de secciones donde solo imparte materias.

---

## 2. Salidas Reales de Pruebas Automatizadas

### 2.1. Suite de Pantallas y Permisos del Profesor (`tests/integration/pantallas-del-profesor.test.ts`)

Comando ejecutado:
```powershell
npx jest tests/integration/pantallas-del-profesor.test.ts --runInBand
```

Salida real:
```text
PASS tests/integration/pantallas-del-profesor.test.ts (6.559 s)
  Fase D — Pantallas y permisos del profesor
    1. Ciclos escolares para el profesor
      √ el profesor solo ve los ciclos donde dio clase o fue guía (137 ms)
      √ el administrador ve todos los ciclos escolares (12 ms)
    2. Materias dentro de la sección
      √ el profesor solo recibe sus materias asignadas en la sección (19 ms)
      √ el administrador recibe todas las materias asignadas a la sección (17 ms)
      √ el profesor puede ver el detalle de su materia asignada (17 ms)
      √ el profesor recibe 403 FORBIDDEN si abre una materia asignada a otro docente (11 ms)
    3. Horarios: solo su propio horario en modo lectura
      √ el profesor puede consultar su propio horario (12 ms)
      √ el profesor recibe 403 al intentar consultar el horario de otro profesor (10 ms)
      √ el profesor recibe 403 al intentar guardar o editar bloques de horario (10 ms)
    4. Mi sección guía
      √ GET /api/classrooms/mis-secciones-guia devuelve la sección donde es guía (15 ms)
      √ GET /api/classrooms/:id/cuadro-general funciona para la sección que guía (100 ms)
      √ GET /api/classrooms/:id/cuadro-general responde 403 para una sección que no guía (8 ms)
    5. Observaciones
      √ un profesor no guía solo recibe sus propias observaciones en la sección (40 ms)

Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        6.866 s, estimated 7 s
Ran all test suites matching /tests\integration\pantallas-del-profesor.test.ts/i.
[jest-teardown] instituto de pruebas borrado de la base de plataforma
```

### 2.2. Suite de Cifras por Lapso y Asistencia Nula (`tests/integration/cifras-por-lapso.test.ts`)

Comando ejecutado:
```powershell
npx jest tests/integration/cifras-por-lapso.test.ts --runInBand
```

Salida real:
```text
PASS tests/integration/cifras-por-lapso.test.ts (6.428 s)
  Cifras y estadísticas por lapso (Fase C+)
    √ calcula las cifras del Primer Lapso con los datos conocidos en el año escolar (359 ms)
    √ devuelve average: null, asistencia null y 0 observaciones para un lapso sin datos en el año (144 ms)
    √ calcula las cifras del Primer Lapso con los datos conocidos en la sección (74 ms)
    √ devuelve average: null y asistencia null en la sección para un lapso sin notas ni asistencias (63 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        6.716 s, estimated 8 s
Ran all test suites matching /tests\integration\cifras-por-lapso.test.ts/i.
[jest-teardown] instituto de pruebas borrado de la base de plataforma
```

### 2.3. Suite de Secciones Asignadas (`tests/integration/las-secciones-que-me-tocan.test.ts`)

Comando ejecutado:
```powershell
npx jest tests/integration/las-secciones-que-me-tocan.test.ts --runInBand
```

Salida real:
```text
PASS tests/integration/las-secciones-que-me-tocan.test.ts (6.086 s)
  Las secciones que me tocan
    √ SECC-01: el profesor recibe la que guía y donde imparte, y ninguna más (141 ms)
    √ SECC-02: el administrador las recibe todas (16 ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        6.394 s, estimated 7 s
Ran all test suites matching /tests\integration\las-secciones-que-me-tocan.test.ts/i.
[jest-teardown] instituto de pruebas borrado de la base de plataforma
```

### 2.4. Suite de Consultas que no Crecen N1 (`tests/integration/consultas-que-no-crecen.test.ts`)

Comando ejecutado:
```powershell
npx jest tests/integration/consultas-que-no-crecen.test.ts --runInBand
```

Salida real:
```text
  console.log
    N1-01 lista de alumnos de la sección (admin): 17 → 17
    N1-02 la sección (admin): 5 → 5
    N1-03 cifras de la sección (admin): 7 → 7
    N1-04 clase en vivo (profesor): 22 → 22
    N1-05 panel del admin: 89 → 89
    N1-06 panel del profesor: 19 → 19
    N1-07 actividades de la sección (profesor): 10 → 10
    N1-08 lista de usuarios (admin): 8 → 8
    N1-09 lista de alumnos del profesor: 19 → 19
    N1-10 observaciones de la sección (admin): 8 → 8
    N1-11 estadística de la sección (admin): 35 → 35
    N1-12 estadística del año (admin): 51 → 51
    N1-13 estadística del ciclo (admin): 72 → 72
    N1-14 resumen final de la sección (admin): 20 → 20
    N1-15 consejo de sección (admin): 19 → 19
    N1-16 cuadro de honor (admin): 4 → 4
    N1-17 cuadro general de la sección guía (profesor): 18 → 18

      at Object.<anonymous> (tests/integration/consultas-que-no-crecen.test.ts:125:17)

PASS tests/integration/consultas-que-no-crecen.test.ts (7.888 s)
  Las pantallas no hacen una consulta por alumno (N1)
    √ N1-01 lista de alumnos de la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno (2 ms)
    √ N1-02 la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-03 cifras de la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-04 clase en vivo (profesor): de 3 a 15 alumnos, las consultas no crecen por alumno (1 ms)
    √ N1-05 panel del admin: de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-06 panel del profesor: de 3 a 15 alumnos, las consultas no crecen por alumno (1 ms)
    √ N1-07 actividades de la sección (profesor): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-08 lista de usuarios (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-09 lista de alumnos del profesor: de 3 a 15 alumnos, las consultas no crecen por alumno (1 ms)
    √ N1-10 observaciones de la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-11 estadística de la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-12 estadística del año (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-13 estadística del ciclo (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-14 resumen final de la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-15 consejo de sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-16 cuadro de honor (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-17 cuadro general de la sección guía (profesor): de 3 a 15 alumnos, las consultas no crecen por alumno

Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
Snapshots:   0 total
Time:        8.201 s
Ran all test suites matching /tests\integration\consultas-que-no-crecen.test.ts/i.
[jest-teardown] instituto de pruebas borrado de la base de plataforma
```

---

## 3. Verificación de Compilación y Tipado Estricto

### 3.1. Backend Typecheck
Comando: `npx tsc --noEmit` en `apps/backend`
Resultado: Código de salida `0` (cero errores de compilación TypeScript).

### 3.2. Frontend Typecheck
Comando: `npx tsc --noEmit` en `apps/web`
Resultado: Código de salida `0` (cero errores de compilación TypeScript).

### 3.3. Auditoría de Conformidad Móvil
Comando: `npm run movil -- --exigir` en la raíz del proyecto
Resultado: Código de salida `0`.

---

## 4. Estado de Archivos Modificados y Creados

```text
Modificados:
  apps/backend/src/controllers/academic-years.controller.ts
  apps/backend/src/controllers/classroomSubjects.controller.ts
  apps/backend/src/controllers/classrooms.controller.ts
  apps/backend/src/controllers/observations.controller.ts
  apps/backend/src/controllers/scheduleBlocks.controller.ts
  apps/backend/src/routes/classrooms.routes.ts
  apps/backend/src/services/citaciones.service.ts
  apps/backend/src/services/paquete-de-precarga.service.ts
  apps/backend/tests/integration/cifras-por-lapso.test.ts
  apps/backend/tests/integration/consultas-que-no-crecen.test.ts
  apps/web/src/app/(dashboard)/dashboard/academico/[cycleId]/[sectionId]/page.tsx
  apps/web/src/app/(dashboard)/dashboard/academico/[cycleId]/page.tsx
  apps/web/src/app/(dashboard)/dashboard/academico/page.tsx
  apps/web/src/app/(dashboard)/dashboard/horarios/page.tsx
  apps/web/src/app/(dashboard)/dashboard/horarios/profesor/[teacherId]/page.tsx
  apps/web/src/components/academic/AcademicStats.tsx
  apps/web/src/components/academic/GradeAccordion.tsx
  apps/web/src/components/academic/SubjectCard.tsx
  apps/web/src/components/schedule/TeacherScheduleEditor.tsx
  apps/web/src/lib/el-menu.ts
  tests/e2e/selector-de-lapso.spec.ts

Nuevos:
  apps/backend/src/controllers/cuadro-general.controller.ts
  apps/backend/src/services/cuadro-general.service.ts
  apps/backend/tests/integration/pantallas-del-profesor.test.ts
  apps/web/src/app/(dashboard)/dashboard/mi-seccion-guia/page.tsx
  docs/antigravity/INFORME-FASE-D.md
```
