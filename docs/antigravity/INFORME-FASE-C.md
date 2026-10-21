# Informe de Revisión y Corrección de la Fase C (Fase C+)

Fecha: 2026-10-07  
Rama: `trabajo/integracion-nube`  
Estado: CORREGIDA, VERIFICADA Y CON PRUEBAS EN VERDE  

---

## 1. Resumen de Correcciones Realizadas

En atención a la revisión `docs/antigravity/REVISION-FASE-C.md` y a los requerimientos añadidos sobre el selector de lapso en pantallas académicas:

1. **Punto 1 (Inicio del Profesor):**
   - Corregido en `apps/backend/src/services/dashboard.service.ts`: `classrooms` ahora incluye las secciones donde el docente imparte clase (`subjects: { some: { teacherId } }`) pertenecientes al ciclo activo, además de las secciones donde figura como profesor guía o profesor titular.
   - La asistencia ahora se calcula sobre la asistencia de sus secciones (filtrando `classroomId` en esas secciones) durante los últimos 30 días, calculados con la fecha oficial del liceo (`todayInTimezone(await instituteTimezone(db))` de `utils/school-time.ts`), y no con la hora del reloj del servidor.
   - Se preservó estrictamente la corrección de Claude que eliminó la copia desactualizada en Redis (`stats:teacher`).
   - Se añadió la prueba requerida en `apps/backend/tests/integration/panel-del-profesor.test.ts`: verifica que un profesor que solo imparte materias (no es guía) visualiza sus secciones, sus alumnos y su asistencia distintos de 0.
   - Verificado que las consultas no crecen: N1-06 se mantiene constante en 19 consultas.

2. **Punto 2 (Barra Inferior del Representante):**
   - **Historial de Git:** Se investigó el origen del problema mediante `git log -L 194,204:apps/web/src/lib/el-menu.ts` y el commit `0a43026` (*«web: fuera el calendario»*). Originalmente la barra del tutor tenía `['/dashboard/calendario', MI_CUENTA]`. Al retirarse el calendario por instrucción del liceo, `losDeLaBarra` para `TUTOR` quedó únicamente con `[MI_CUENTA]`.
   - **Causa del desvío:** En `BarraInferiorMovil.tsx`, la división de destinos usaba `mitad = Math.ceil(1 / 2) = 1`, asignando `izquierda = [MI_CUENTA]` y `derecha = []`. Esto colocaba a «Inicio» en el extremo derecho sin elemento que lo balanceara, empujándolo contra el borde. No fue roto en la Fase C, sino que venía desde la eliminación del calendario.
   - **Corrección:** En `BarraInferiorMovil.tsx`, cuando `destinos.length === 1`, se agrega un espaciador simétrico `<div className="flex-1" aria-hidden="true" />` a la derecha de «Inicio», logrando que la casita quede exactamente en el centro geométrico de la pantalla y de la zona del pulgar.

3. **Punto 3 (Helpers E2E):**
   - En `tests/e2e/helpers.ts`, se eliminó la captura y reintento de respuestas HTTP `503` dentro de `loginViaUI`. Únicamente se reintenta el código HTTP `429` (*Too Many Requests / rate limiting* legítimo), evitando enmascarar sobrecargas o saturación real de la base de datos.

4. **Adición: Selector de Lapso en Pantallas Académicas (Año, Sección, Materia):**
   - **Pantalla del año (`/dashboard/academico/<ciclo>`):**
     - `getAcademicYearStats` (`apps/backend/src/controllers/academic-years.controller.ts`) ahora recibe y procesa el parámetro `periodId`.
     - Filtra `grades` por `periodId`, y filtra `observations` y `dailyAttendance` por el rango de fechas (`startDate` a `endDate`) del lapso seleccionado.
     - Si no hay notas evaluadas en el lapso, devuelve `average: null` en lugar de `0`.
   - **Pantalla de la sección (`/dashboard/academico/<ciclo>/<sección>`):**
     - `getClassroomStats` (`apps/backend/src/controllers/classrooms.controller.ts`) ahora filtra `dailyAttendance` por el rango de fechas del lapso.
     - Si ningún estudiante tiene calificaciones en el lapso, devuelve `average: null` en lugar de `0`.
   - **Tratamiento de lapsos sin notas:**
     - En `AcademicStats.tsx`, cuando `average === null` o no hay notas, se muestra `—` en lugar de `0`.
     - En la tabla de estudiantes y tarjetas de materias (`SubjectCard.tsx`, `[sectionId]/page.tsx`, `[subjectId]/page.tsx`, `academicRisk.ts`), se sustituyó `Sin calificar` por `Sin notas` para los alumnos sin registros en el lapso.
   - **Pruebas añadidas:**
     - Prueba unitaria/integración en el servidor: `apps/backend/tests/integration/cifras-por-lapso.test.ts` (4 pruebas que verifican año y sección con datos conocidos y con lapsos vacíos).
     - Pruebas E2E en navegador: `tests/e2e/selector-de-lapso.spec.ts` (3 pruebas que conmutan lapsos en año, sección y materia, verificando actualización reactiva de cifras).
   - Se actualizó `docs/MAPA_DE_CALCULOS.md` con las especificaciones de filtrado por fechas y promedios nulos.

---

## 2. Comparativa de Cálculos: SQL Manual vs Pantalla

Se realizaron cálculos directos mediante consultas SQL sobre la base de datos `gestion_escolar` del liceo `instituto-testing` (`ay-2026-2027-testing`), comparando la sección `1er Año A` (`cmtayvyu2000jvvbop9sy5j83`, 29 estudiantes) y la materia `Matemática` (`materia-mate`):

### 2.1. Sección: 1er Año A

| Métrica | Primer Lapso (SQL Manual) | Primer Lapso (Pantalla) | Segundo Lapso (SQL Manual) | Segundo Lapso (Pantalla) | Coincidencia |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Promedio Sección** | **13.1** (29 alumnos con nota) | **13.1** | **Sin notas** (0 alumnos evaluados) | **—** | Exacta |
| **Alumnos en Riesgo** | **14** (evaluados con promedio < 10 o materia reprobada) | **14** | **0** | **0** | Exacta |
| **Asistencia** | **91%** (850 presentes / 931 registros) | **91%** | **0%** (0 registros en rango de fechas) | **0%** | Exacta |
| **Observaciones** | **83** (registradas entre ago y dic 2026) | **83** | **0** (registradas entre ene y abr 2027) | **0** | Exacta |

### 2.2. Materia: Matemática (1er Año A)

| Métrica | Primer Lapso (Servidor / SQL Nivel 3) | Primer Lapso (Pantalla) | Segundo Lapso (Servidor / SQL) | Segundo Lapso (Pantalla) | Coincidencia |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Promedio Materia** | **14.1** (promedio jerárquico Nivel 3 sobre actividades) | **14.1** | **Sin notas** (hasData = false) | **—** | Exacta |
| **Alumnos Evaluados** | **29** | **29** | **0** | **0** | Exacta |
| **Alumnos en Riesgo** | **0** | **0** | **0** | **0** | Exacta |
| **Asistencia** | **91%** | **91%** | **0%** | **0%** | Exacta |
| **Observaciones** | **2** | **2** | **0** | **0** | Exacta |

### 2.3. Ciclo Completo (Año 2026-2027)

| Métrica | Primer Lapso (SQL Manual) | Primer Lapso (Pantalla) | Segundo Lapso (SQL Manual) | Segundo Lapso (Pantalla) | Coincidencia |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Promedio Ciclo** | **13.0** (599 alumnos evaluados) | **13.0** | **Sin notas** | **—** | Exacta |
| **Total en Riesgo** | **257** | **257** | **0** | **0** | Exacta |
| **Total Asistencia** | **93%** (6355/6811) | **93%** | **0%** | **0%** | Exacta |
| **Observaciones** | **193** | **193** | **0** | **0** | Exacta |

---

## 3. Fotografías de los Tres Inicios (390 px de ancho)

Capturadas en emulación de dispositivo móvil (ancho 390 px, alto 844 px) con datos reales de `instituto-testing`:

### 3.1. Inicio del Profesor (`profesor3@testing.edu.ve`)

Archivo: `docs/antigravity/fotos/inicio-profesor3.png`  
Artifact: `inicio-profesor3.png`

- **Promedio de mis clases:** 13.8 / 20.
- **Secciones y alumnos:** `Ciclo 2026-2027 · 299 estudiantes · 10 secciones` (ya no muestra 0 estudiantes ni 0 secciones).
- **Asistencia:** `92% · Últimos 30 días` (ya no muestra 0%).
- **En riesgo:** 4 alumnos.
- **Barra inferior:** Académico, Materias, Inicio (centrado con casita verde), Horarios, Mi cuenta.

### 3.2. Inicio del Representante (`tutor.prueba@testing.edu.ve`)

Archivo: `docs/antigravity/fotos/inicio-tutor.prueba.png`  
Artifact: `inicio-tutor.prueba.png`

- **Promedio de sus representados:** 15.3 / 20.
- **Asistencia media:** 91%.
- **Representado:** Daniela Díaz (5.° D).
- **Barra inferior corregida:** «Inicio» se sitúa exactamente en el centro de la pantalla, con espaciado balanceado frente al botón «Mi cuenta».

### 3.3. Inicio del Alumno (`est0575@testing.edu.ve`)

Archivo: `docs/antigravity/fotos/inicio-est0575.png`  
Artifact: `inicio-est0575.png`

- **Promedio general:** 15.3 / 20.
- **Asistencia:** 91%.
- **Cuadro de honor:** Puntaje 75.1 pts. Por tener puesto superior al 10.º, la posición se mantiene privada y no se muestra el número de puesto.
- **Barra inferior:** Mi boleta, Inicio (centrado), Mi cuenta.

---

## 4. Salidas Reales de Ejecución

### 4.1. Auditoría Móvil (`npm run movil -- --exigir`)

```
> movil
> node scripts/auditoria-del-telefono.mjs

  ✓                                  Administrador · Inicio
  ✓                                  Administrador · Académico
  ✓                                  Administrador · Ciclo
  ✓                                  Administrador · Sección
  ✓                                  Administrador · Sección · materia
  ✓                                  Administrador · Promoción
  ✓                                  Administrador · Fin del año
  ✓                                  Administrador · Matrícula
  ✓                                  Administrador · Graduandos
  ✓                                  Administrador · Resumen final
  ✓                                  Administrador · Consejo de sección
  ✓                                  Administrador · Carnets
  ✓                                  Administrador · Plan de evaluación impreso
  ✓                                  Administrador · Acta de socialización
  ✓                                  Administrador · Instrumentos de evaluación
  ✓                                  Administrador · Comedor
  ✓                                  Administrador · Resumen del comedor
  ✓                                  Administrador · Pendientes
  ✓                                  Administrador · Observaciones
  ✓                                  Administrador · Labor social
  ✓                                  Administrador · Aulas
  ✓                                  Administrador · Un aula
  ✓                                  Administrador · Materias
  ✓                                  Administrador · Una materia
  ✓                                  Administrador · Horarios
  ✓                                  Administrador · Horario de sección
  ✓                                  Administrador · Horario de profesor
  ✓                                  Administrador · Carga horaria
  ✓                                  Administrador · Constancia de trabajo
  ✓                                  Administrador · Usuarios
  ✓                                  Administrador · Ficha de alumno
  ✓                                  Administrador · Certificación
  ✓                                  Administrador · Planilla de inscripción
  ✓                                  Administrador · Notas parciales
  ✓                                  Administrador · Importar alumno
  ✓                                  Administrador · Constancia
  ✓                                  Administrador · Eventos
  ✓                                  Administrador · Finanzas
  ✓                                  Administrador · Finanzas · estudiantes
  ✓                                  Administrador · Finanzas · personal
  ✓                                  Administrador · Finanzas · gastos y fondos
  ✓                                  Administrador · Configuración
  ✓                                  Profesor · Inicio
  ✓                                  Profesor · Académico
  ✓                                  Profesor · Su sección
  ✓                                  Profesor · Plan de evaluación
  ✓                                  Profesor · Clase en vivo
  ✓                                  Profesor · Materias
  ✓                                  Profesor · Pendientes
  ✓                                  Profesor · Observaciones
  ✓                                  Profesor · Labor social
  ✓                                  Profesor · Horarios
  ✓                                  Profesor · Mis pagos
  ✓                                  Estudiante · Inicio
  ✓                                  Representante · Inicio

55 pantallas · 0 con algo que arreglar

Abre  docs/capturas-movil/index.html
```

### 4.2. Pruebas de Integración del Panel del Profesor (`panel-del-profesor.test.ts`)

```
PASS tests/integration/panel-del-profesor.test.ts (70.463 s)
  Dashboard del profesor (Fase C)
    √ calcula exactamente las cifras del profesor con datos conocidos (976 ms)
    √ una nota cambiada se ve en el promedio: el servicio no guarda copia vieja (557 ms)
    √ refleja isGuideTeacher = false si el profesor no guía ninguna sección (331 ms)
    √ un profesor que solo imparte (no guía) ve sus secciones, sus alumnos y su asistencia, distintos de 0 (203 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        71.872 s
```

### 4.3. Pruebas de Integración de Cifras por Lapso (`cifras-por-lapso.test.ts`)

```
PASS tests/integration/cifras-por-lapso.test.ts (11.685 s)
  Cifras y estadísticas por lapso (Fase C+)
    √ calcula las cifras del Primer Lapso con los datos conocidos en el año escolar (536 ms)
    √ devuelve average: null, 0% asistencia y 0 observaciones para un lapso sin datos en el año (271 ms)
    √ calcula las cifras del Primer Lapso con los datos conocidos en la sección (139 ms)
    √ devuelve average: null y 0% de asistencia en la sección para un lapso sin notas ni asistencias (104 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        12.134 s
```

### 4.4. Pruebas de Consultas que no Crecen (`consultas-que-no-crecen.test.ts`)

```
PASS tests/integration/consultas-que-no-crecen.test.ts (13.808 s)
  Las pantallas no hacen una consulta por alumno (N1)
    √ N1-01 lista de alumnos de la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno (3 ms)
    √ N1-02 la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-03 cifras de la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-04 clase en vivo (profesor): de 3 a 15 alumnos, las consultas no crecen por alumno (1 ms)
    √ N1-05 panel del admin: de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-06 panel del profesor: de 3 a 15 alumnos, las consultas no crecen por alumno (1 ms)
    √ N1-07 actividades de la sección (profesor): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-08 lista de usuarios (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-09 lista de alumnos del profesor: de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-10 observaciones de la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-11 estadística de la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-12 estadística del año (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-13 estadística del ciclo (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-14 resumen final de la sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno (1 ms)
    √ N1-15 consejo de sección (admin): de 3 a 15 alumnos, las consultas no crecen por alumno
    √ N1-16 cuadro de honor (admin): de 3 a 15 alumnos, las consultas no crecen por alumno

Test Suites: 1 passed, 1 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        14.238 s
```

### 4.5. Pruebas E2E de Playwright del Selector de Lapso (`selector-de-lapso.spec.ts`)

```
Running 3 tests using 1 worker

  ok 1 [chromium] › tests\e2e\selector-de-lapso.spec.ts:25:9 › Selector de lapso en pantallas académicas › 1. Pantalla del año (/dashboard/academico/<ciclo>): las cifras cambian al cambiar de lapso (9.7s)
  ok 2 [chromium] › tests\e2e\selector-de-lapso.spec.ts:69:9 › Selector de lapso en pantallas académicas › 2. Pantalla de la sección (/dashboard/academico/<ciclo>/<sección>): cifras cambian y lapso vacío muestra «—» y «Sin notas» (11.8s)
  ok 3 [chromium] › tests\e2e\selector-de-lapso.spec.ts:115:9 › Selector de lapso en pantallas académicas › 3. Pantalla de la materia (/dashboard/academico/<ciclo>/<sección>/<materia>): cifras cambian y lapso vacío muestra «—» y «Sin notas» (13.3s)

  3 passed (37.0s)
```

### 4.6. Pruebas Unitarias de Frontend (`apps/web`)

```
Test Suites: 23 passed, 23 total
Tests:       121 passed, 121 total
Snapshots:   0 total
Time:        30.007 s
Ran all test suites.
```

### 4.7. Compilación y Comprobación de Tipos (TypeScript)

- **Backend (`apps/backend`):**
  ```
  > gestion-escolar-backend@1.0.0 build
  > tsc
  (salida limpia, código 0)
  ```
- **Frontend (`apps/web`):**
  ```
  > tsc --noEmit
  (salida limpia, código 0)
  ```
- **Build de Next.js (`apps/web`):**
  ```
  ✓ Compiled successfully in 10.8s
  Finished TypeScript in 37.2s ...
  ✓ Generating static pages using 11 workers (41/41) in 1906ms
  (salida limpia, código 0)
  ```

---

## 5. Conclusión y Detención

Todos los puntos señalados en `docs/antigravity/REVISION-FASE-C.md` han sido subsanados sin revertir ninguna de las correcciones previas de Claude. El selector de lapso opera correctamente tanto en el servidor como en la interfaz gráfica, los lapsos vacíos presentan «—» y «Sin notas» de forma homogénea, y las 55 pantallas móviles cumplen al 100% las exigencias de diseño y usabilidad.

Siguiendo la instrucción explícita del usuario, el trabajo concluye y el asistente se detiene en este punto.
