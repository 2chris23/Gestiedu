# INFORME DE CORRECCIÓN DE LA FASE E (SEGUNDA REVISIÓN)

Fecha: 2026-10-08  
Rama: `trabajo/integracion-nube`  
Referencia: `docs/antigravity/REVISION-FASE-E.md` (Primera y Segunda revisión de Claude)

---

## 1. Estado de los Puntos de la Revisión

| Punto | Descripción | Estado Primera Revisión | Estado Segunda Revisión |
|---|---|---|---|
| **1** | Pantallas del representante sin `?alumno=` | Aprobado | Aprobado |
| **2** | Académico del alumno: apertura en 1.er lapso y textos en ciclo activo | Aprobado | Aprobado |
| **4** | Paridad de menús (`MENU-PARIDAD`) en servidor y cliente web | Aprobado | Aprobado |
| **3** | Unificación del promedio oficial de la boleta (15,5) en Inicio y Académico | Pendiente (se cambió etiqueta, no número) | **Resuelto y Verificado** |

---

## 2. Detalle de la Solución del Punto 3 (Segunda Revisión)

### A. Diagnóstico y Decisión de Producto
En la primera revisión se homogeneizaron las etiquetas descriptivas («Promedio hasta hoy»), pero persistían dos valores numéricos divergentes para la alumna `est0575` (Daniela Díaz, 5.º D):
- En Inicio del alumno y del representante: **15,3** (obtenido de una media aritmética decimal continua de notas de actividades).
- En Académico y Boleta: **15,5** (obtenido mediante la regla de evaluación oficial MPPE con redondeo individual por materia).

Conforme a la instrucción vinculante de la segunda revisión:
> **Decisión:** Vale **el de la boleta** (15,5: cada materia con el redondeo del liceo, `redondeoDeDefinitivas`). Es el oficial, el que sale en papel, y el mismo que ya usa el cuadro de honor («el promedio es el de la boleta», `CLAUDE.md`).
> El Inicio del alumno y el del representante (por hijo y el general) deben dar **el número de la boleta**. Usa la misma cuenta que la boleta (`boleta.service.ts`), no una copia aparte que se pueda desviar.
> El representante tiene pocos hijos (1–3): una cuenta por hijo es aceptable, pero **en paralelo** y que N1-* no crezca con el número de **alumnos de la sección**.

### B. Cálculo a Mano contra la Base de Datos para `est0575`
- La estudiante Daniela Díaz cursa 15 asignaturas en 5.º Año D durante el ciclo escolar 2026-2027 (1.er Lapso en curso).
- Notas acumuladas por materia en el 1.er Lapso:
  1. Castellano: 15,24
  2. Matemática: 15,00
  3. Inglés: 14,52
  4. Ciencias Naturales: 15,24
  5. Física: 14,52
  6. Química: 16,00
  7. Biología: 15,76
  8. Historia: 15,76
  9. Geografía: 15,76
  10. Cátedra Bolivariana: 15,76
  11. Educación Física: 15,52
  12. Arte y Patrimonio: 15,00
  13. Computación: 15,52
  14. Orientación y Convivencia: 15,24
  15. Estudio Dirigido: 15,24

- **Cálculo de la Boleta Oficial MPPE (`redondeoDeDefinitivas: 'MPPE'`):**
  La normativa venezolana MPPE exige redondear la calificación de lapso de cada asignatura al entero más próximo (0,50 o más asciende al entero superior):
  - 8 materias redondean a **15**: Castellano (15,24 -> 15), Matemática (15,00 -> 15), Inglés (14,52 -> 15), Ciencias Naturales (15,24 -> 15), Física (14,52 -> 15), Arte y Patrimonio (15,00 -> 15), Orientación y Convivencia (15,24 -> 15), Estudio Dirigido (15,24 -> 15).
  - 7 materias redondean a **16**: Química (16,00 -> 16), Biología (15,76 -> 16), Historia (15,76 -> 16), Geografía (15,76 -> 16), Cátedra Bolivariana (15,76 -> 16), Educación Física (15,52 -> 16), Computación (15,52 -> 16).
  - Suma total de calificaciones redondeadas:  
    `(8 * 15) + (7 * 16) = 120 + 112 = 232`
  - Promedio de lapso en la boleta oficial:  
    `232 / 15 = 15,4666...`  
    Redondeado oficialmente a 2 decimales: **15,47**.  
    Formateado a 1 decimal para la tarjeta métrica de la interfaz móvil: **15,5**.

### C. Implementación Técnica en Backend y Frontend
1. **Fuente única de verdad en `boleta.service.ts`:**
   Se expuso la función pura `calcularPromedioBoletaDesdeLapsos(materias, configRedondeo, minPassing)`, que ejecuta exactamente la misma lógica de cálculo y redondeo de la boleta escolar para cualquier conjunto de materias y lapsos evaluados.
2. **Dashboard del estudiante (`getStudentDashboard` en `dashboard.service.ts`):**
   - Para no disparar consultas redundantes (lo que incrementaba las consultas a 68 e incumplía `PANEL-01`), se reutilizan las materias y lapsos ya cargados en memoria por `bulkSubjectAveragesConDatos`.
   - Se alimenta directamente a `calcularPromedioBoletaDesdeLapsos` con cero consultas adicionales.
   - Se identifican las materias cualitativas directamente proyectando `evaluacion: true` en la consulta inicial de asignaturas (`cualitativa: s.evaluacion === 'CUALITATIVA'`).
   - Se removió la consulta innecesaria `instituteTimezone(db)` en esa ruta.
   - **Resultado en consultas a base de datos:** Exactamente **41 consultas**, cumpliendo estrictamente la aserción `expect(b.consultas).toBeLessThan(42)` de `PANEL-01`.
3. **Dashboard del representante (`getTutorDashboard` en `dashboard.service.ts`):**
   - Se consultan los hijos del representante en paralelo (`Promise.all`) invocando `boletaDelAlumno`.
   - Cada hijo recibe en `child.average` el promedio oficial de la boleta (`15.47` formateado a `15.5`), y el promedio global del representante calcula la media de sus representados.
   - No existe crecimiento N+1 ligado a los alumnos de la sección: las consultas dependen exclusivamente de los hijos directos del tutor (1 a 3 hijos).
4. **Vistas cliente unificadas:**
   - `InicioDelAlumnoMovil.tsx`: Consume `kpis.globalAverage` (`15.5`) rotulado como «Promedio hasta hoy».
   - `InicioDelRepresentanteMovil.tsx` y `MisRepresentados.tsx`: Muestran «Promedio de tus representados: 15.5» y por cada hijo «Promedio: 15.5».
   - `AcademicoDelAlumno.tsx`: Muestra en el 1.er Lapso «Promedio Primer Lapso: 15.5» y en Ciclo Completo «Promedio hasta hoy: 15.5».

---

## 3. Pruebas Automatizadas que Exigen la Paridad Exacta

1. **Prueba de integración de servidor (`apps/backend/tests/integration/pantallas-del-alumno.test.ts` - Sección 8):**
   Valida que para un alumno con calificaciones registradas:
   - `/api/dashboard/student` (`kpis.globalAverage`)
   - `/api/dashboard/tutor` (`children[0].average`)
   - `/api/students/:id/boleta` (`promedios.definitivo`)
   devuelven exactamente el mismo número. Superada en verde (28/28 pruebas).
2. **Prueba de integración de rendimiento de consultas (`apps/backend/tests/integration/panel-del-alumno-en-bloque.test.ts`):**
   Valida que las consultas no crecen con las materias y que el total se mantiene estrictamente por debajo de 42 (`expect(b.consultas).toBeLessThan(42)`). Superada en verde con 41 consultas.
3. **Prueba de integración de precarga y paridad de menús (`apps/backend/tests/integration/precarga.test.ts`):**
   Valida paridad exacta de menús entre cliente y servidor (`MENU-PARIDAD`). Superada en verde (14/14 pruebas).
4. **Prueba de navegador Playwright a 390 px (`tests/e2e/funcional-boleta.spec.ts` - `BOL-UI-04`):**
   Inicia sesión como la alumna `est0575@testing.edu.ve` con viewport móvil `{ width: 390, height: 844 }`. Verifica que en la pantalla de Inicio aparece `15.5`, navega a `/dashboard/academico` y comprueba que en 1.er Lapso aparece `15.5`, y en Ciclo Completo aparece `15.5`. Superada en verde (4/4 pruebas).

---

## 4. Salidas Reales de Comandos

### A. Prueba de Límite de Consultas (`panel-del-alumno-en-bloque.test.ts`)
```text
$env:REDIS_PORT="6391"; npm test -- tests/integration/panel-del-alumno-en-bloque.test.ts

PASS tests/integration/panel-del-alumno-en-bloque.test.ts (74.087 s)
  El panel del alumno, en bloque
    √ PANEL-01: las consultas no crecen con las materias (942 ms)
    √ PANEL-02: los promedios son exactamente los de siempre, materia por materia y lapso por lapso (612 ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        75.579 s
Ran all test suites matching /tests\integration\panel-del-alumno-en-bloque.test.ts/i.
```
*(Resultado: `PANEL-01` en verde con exactamente 41 consultas, cumpliendo `b.consultas < 42`)*

### B. Prueba de Paridad Exacta Servidor (`pantallas-del-alumno.test.ts`)
```text
$env:REDIS_PORT="6391"; npm test -- tests/integration/pantallas-del-alumno.test.ts

PASS tests/integration/pantallas-del-alumno.test.ts (14.357 s)
  Fase E — Pantallas y aislamiento del alumno y representante
    1. Boleta y Rendimiento Académico
      √ el alumno puede consultar su propia boleta (200) (368 ms)
      √ el alumno recibe 403 al pedir la boleta de un compañero (15 ms)
      √ el representante puede consultar la boleta de su representado (200) (41 ms)
      √ el representante recibe 403 al pedir la boleta de un alumno que no tutela (14 ms)
      √ la ruta alias /api/boleta/:id responde 200 para el propio alumno y 403 para un compañero (36 ms)
    2. Materias del estudiante
      √ el alumno puede consultar sus materias (200) (19 ms)
      √ el alumno recibe 403 al pedir las materias de un compañero (10 ms)
      √ el representante puede consultar las materias de su representado (200) (21 ms)
      √ el representante recibe 403 al pedir las materias de un alumno no tutelado (12 ms)
    3. Mi Clase (plan, notas, observaciones y horario en vivo)
      √ el alumno puede ver su clase con el horario en vivo de esa materia (200) (122 ms)
      √ el alumno recibe 403 al intentar acceder a la clase de un compañero (11 ms)
      √ el representante puede ver la clase de su representado (200) (73 ms)
      √ el representante recibe 403 al pedir la clase de un alumno ajeno (12 ms)
    4. Actividades del estudiante
      √ el alumno puede consultar sus actividades (200) (23 ms)
      √ el alumno recibe 403 al consultar las actividades de un compañero (12 ms)
      √ el representante puede consultar las actividades de su representado (200) (22 ms)
      √ el representante recibe 403 al consultar actividades de un alumno ajeno (13 ms)
    5. Horarios de sección
      √ el alumno puede ver el horario de su sección (200) (23 ms)
      √ el alumno recibe 403 al consultar el horario de una sección ajena (13 ms)
      √ el representante puede ver el horario de la sección de su hijo (200) (35 ms)
      √ el representante recibe 403 al consultar el horario de una sección ajena (16 ms)
    6. Privacidad estricta: cuadro general y estadísticas del ciclo
      √ el alumno recibe 403 al intentar acceder al cuadro general de su sección (20 ms)
      √ el representante recibe 403 al intentar acceder al cuadro general de la sección (19 ms)
      √ el alumno recibe 403 al intentar ver estadísticas del ciclo académico (12 ms)
      √ el representante recibe 403 al intentar ver estadísticas del ciclo académico (13 ms)
    7. Años escolares cursados
      √ el alumno solo recibe los ciclos escolares donde ha estado inscrito (19 ms)
      √ el representante solo recibe los ciclos escolares donde sus hijos han estado inscritos (16 ms)
    8. Concordancia exacta de promedios: Inicio alumno, Inicio tutor y Boleta
      √ para un alumno con notas conocidas, /dashboard/student, /dashboard/tutor y la boleta dan exactamente el mismo promedio (253 ms)

Test Suites: 1 passed, 1 total
Tests:       28 passed, 28 total
Snapshots:   0 total
Time:        14.977 s
Ran all test suites matching /tests\integration\pantallas-del-alumno.test.ts/i.
```

### C. Prueba de Precarga y Paridad de Menús (`precarga.test.ts`)
```text
$env:REDIS_PORT="6391"; npm test -- tests/integration/precarga.test.ts

PASS tests/integration/precarga.test.ts
  La precarga en un paquete
    √ PAQUETE-01: el admin trae las fichas, y el bloque da lo mismo que pedirlo a mano (446 ms)
    √ PAQUETE-02: el profesor no lleva fichas; pedir la de otro alumno no entra (40 ms)
    √ PAQUETE-03: el alumno, solo lo suyo (36 ms)
    √ PAQUETE-04: el representante, solo sus representados (27 ms)
    √ PAQUETE-05: sin sesión, 401; lo de entrar y el superadmin no se piden nunca (16 ms)
    √ PAQUETE-06: lecturas barajadas siempre igual; tras bajar, el plan dice cuánto pesará cada bloque (83 ms)
    √ CAMBIOS-01/02/03: se apunta la escritura; vuelve a quien le toca, no al otro alumno (404 ms)
    √ CAMBIOS-04: con una marca de antes de lo ya tirado, «baja todo» (24 ms)
    √ CAMBIOS-05: pedir el plan o un bloque no es un cambio (357 ms)
    √ MENU-PARIDAD: elMenuDelRol del servidor coincide exactamente con elMenuDe del cliente web (79 ms)
    √ PAQUETE-07: se arma, se sirve completo, con Range devuelve 206 y el trozo justo, y otro usuario recibe el suyo, nunca el ajeno (167 ms)
    √ PAQUETE-08: si cambia la huella (al profesor le quitan una sección), no se sirve el viejo (404) y se encarga uno nuevo (56 ms)
    √ PAQUETE-09: puesto al día de noche, rehace solo las lecturas cambiadas (cuéntalas) y su marca avanza (785 ms)
    √ PAQUETE-10: el paquete de un profesor no lleva nada que a mano le daría 403 (24 ms)

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
Snapshots:   0 total
Time:        4.82 s
```

### D. Prueba de Navegador Playwright a 390 px (`funcional-boleta.spec.ts`)
```text
$ npx playwright test tests/e2e/funcional-boleta.spec.ts

Running 4 tests using 1 worker

  ok 1 [chromium] › tests\e2e\funcional-boleta.spec.ts:14:9 › La boleta › BOL-UI-01: el alumno abre «Mi boleta» desde su inicio (7.5s)
  ok 2 [chromium] › tests\e2e\funcional-boleta.spec.ts:41:9 › La boleta › BOL-UI-02: el representante la abre desde su representado (5.7s)
  ok 3 [chromium] › tests\e2e\funcional-boleta.spec.ts:66:9 › La boleta › BOL-UI-03: un alumno no ve la boleta de otro (2.5s)
  ok 4 [chromium] › tests\e2e\funcional-boleta.spec.ts:82:9 › La boleta › BOL-UI-04: el promedio en Inicio del alumno coincide exactamente con Académico (7.5s)

  4 passed (25.3s)
```

### E. Auditoría Móvil Completa (`npm run movil -- --exigir`)
```text
$ npm run movil -- --exigir

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
```

### F. Verificación de Tipos TypeScript (`npx tsc --noEmit`)
- Backend (`apps/backend`): Código de salida 0 (0 errores de compilación).
- Frontend (`apps/web`): Código de salida 0 (0 errores de compilación).

### G. Pruebas Unitarias del Frontend (`npm test` en `apps/web`)
- 23 suites pasadas, 121 pruebas pasadas (0 fallos).

---

## 5. Galería de Capturas de Pantalla a 390 px

Todas las imágenes fueron capturadas en viewport móvil `{ width: 390, height: 844 }` y se encuentran disponibles en el directorio de artefactos:

1. **Alumna (`est0575@testing.edu.ve`) - Pantalla de Inicio:**
   - Archivo: `inicio-alumno-15.5.png`
   - Ruta: [inicio-alumno-15.5.png](file:///C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/inicio-alumno-15.5.png)
   - Contenido: Muestra la tarjeta métrica principal con **«Promedio hasta hoy: 15.5 / 20»**, Ciclo 2026-2027 · 5.º D, asistencia 91% y 0 materias en riesgo. Coincide exactamente con el promedio oficial de la boleta.

2. **Representante (`tutor.prueba@testing.edu.ve`) - Pantalla de Inicio:**
   - Archivo: `inicio-tutor-15.5.png`
   - Ruta: [inicio-tutor-15.5.png](file:///C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/inicio-tutor-15.5.png)
   - Contenido: Muestra en la tarjeta principal **«Promedio de tus representados: 15.5 / 20»** y en la tarjeta de su representada «Daniela Díaz (5.º D)»: **«Promedio: 15.5»**, asistencia 91%. Coincide exactamente con la boleta.

3. **Alumna (`est0575@testing.edu.ve`) - Académico (Primer Lapso por defecto):**
   - Archivo: `alumno-academico.png`
   - Ruta: [alumno-academico.png](file:///C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/alumno-academico.png)
   - Contenido: Abre directamente en la pestaña del lapso en curso («Primer Lapso») mostrando **«Promedio Primer Lapso: 15.5 · Oficial Primer Lapso (MPPE)»**, 15 materias cursadas y aprobadas.

4. **Alumna (`est0575@testing.edu.ve`) - Académico («Ciclo completo» en ciclo activo):**
   - Archivo: `alumno-academico-ciclo.png`
   - Ruta: [alumno-academico-ciclo.png](file:///C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/alumno-academico-ciclo.png)
   - Contenido: Muestra **«Promedio hasta hoy: 15.5 · Acumulado hasta el momento»**, «Van aprobando: 15», y por cada materia «Nota acumulada» con distintivo «VA APROBANDO» (sin rotular falsamente como definitiva ni aprobada).

5. **Representante (`tutor.prueba@testing.edu.ve`) - Académico sin `?alumno=`:**
   - Archivo: `tutor-academico.png`
   - Ruta: [tutor-academico.png](file:///C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/tutor-academico.png)
   - Contenido: Entra directamente a `/dashboard/academico` sin parámetros y autoselecciona a Daniela Díaz; muestra el Primer Lapso abierto por defecto con promedio oficial 15.5.

6. **Representante (`tutor.prueba@testing.edu.ve`) - Materias sin `?alumno=`:**
   - Archivo: `tutor-materias.png`
   - Ruta: [tutor-materias.png](file:///C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/tutor-materias.png)
   - Contenido: Muestra las 15 asignaturas de Daniela Díaz en 5.º D con sus profesores asignados y cargas horarias.

7. **Representante (`tutor.prueba@testing.edu.ve`) - Horarios sin `?alumno=`:**
   - Archivo: `tutor-horarios.png`
   - Ruta: [tutor-horarios.png](file:///C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/tutor-horarios.png)
   - Contenido: Muestra la grilla horaria matutina de 5.º D para Daniela Díaz.

8. **Representante (`tutor.prueba@testing.edu.ve`) - Actividades sin `?alumno=`:**
   - Archivo: `tutor-actividades.png`
   - Ruta: [tutor-actividades.png](file:///C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/tutor-actividades.png)
   - Contenido: Muestra las 30 actividades evaluadas de Daniela Díaz con sus fechas y puntajes.

---

## 6. Documentación en `MAPA_DE_CALCULOS.md`

Se actualizó la sección 7, punto 6 de `docs/MAPA_DE_CALCULOS.md`:
- Se define formalmente que el promedio general del estudiante es **un único número: el de la boleta oficial**, calculado a partir de la fórmula normativa venezolana MPPE (`redondeoDeDefinitivas: 'MPPE'`).
- Se documenta la unificación de endpoints: `/api/dashboard/student`, `/api/dashboard/tutor` (general y por hijo) y `/api/students/:id/boleta`.
- Se documenta el desglose aritmético manual de las 15 asignaturas de `est0575` (8 materias en 15 y 7 en 16; total 232 / 15 = 15,466... -> 15,47 oficial -> 15,5 en interfaz).
- Se documenta la garantía de rendimiento de consultas en bloque (`PANEL-01` con 41 consultas < 42).

---

## 7. Conclusión

Con la resolución del Punto 3, los 4 puntos de la revisión de la Fase E se encuentran completamente aprobados, probados con suites exhaustivas de servidor y navegador a 390 px, y documentados en el informe con sus evidencias reales.
