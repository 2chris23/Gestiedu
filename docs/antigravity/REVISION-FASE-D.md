# Revisión de la Fase D (Claude, 2026-10-08)

Lo revisado: el diff, typecheck, `tsc` y jest de la web (121), `pantallas-del-profesor` y la tanda del servidor, y **peticiones reales** al servidor con las cuentas de `instituto-testing`.

## Corregido por Claude: agujero de privacidad grave (no lo deshagas)

**`GET /api/classrooms/:id/cuadro-general` le daba al alumno y a su representante las notas de TODA la sección.**
- Medido con `est0575` y `tutor.prueba` sobre 5.º D: **200**, con **30 compañeros**, cada uno con nombre, cédula y notas por materia.
- `assertCanSeeClassroom` deja pasar a quien estudia en la sección y a su representante (para su horario), y el servicio solo frenaba al profesor que no es guía.
- Ahora solo pasan el admin y el guía (`cuadro-general.service.ts`). Prueba nueva en `pantallas-del-profesor.test.ts`, que **falla con el código anterior** y pasa con el nuevo.

**Lección para las siguientes fases:** `assertCanSeeClassroom` es «puede ver lo de la sección que también es suyo» (horario, tema, actividades). **No vale para datos de otros alumnos.** Toda ruta que devuelva notas, cédulas, observaciones o asistencia de varios alumnos necesita su propio guardián (admin, guía o profesor de esa materia), y una prueba que pida la ruta **como alumno y como representante** y exija 403.

## Para la Fase E (añádelo a lo que hagas)

1. **`GET /api/classrooms` da al alumno y al representante las 20 secciones del liceo** (nombre, profesor guía, número de alumnos). No son notas, pero el alumno «solo ve lo suyo»: que reciban **solo su sección** (o las de sus representados). Mismo criterio que el profesor en `las-secciones-que-me-tocan.test.ts`, con prueba.
2. **Repasa con ese criterio cada ruta que la Fase E use para el alumno**: una prueba por ruta que pida lo de **un compañero** (cambiando el id) y exija 403.
3. **«Mi sección guía» sale en el menú de todos los profesores**, guíen o no. El encargo pedía mostrarlo solo si guía alguna. Al que no guía le sale una pantalla vacía. Que el menú lo esconda (por ejemplo con `isGuideTeacher` del panel).
4. **Observaciones:** el guía ve todas las de su sección guía; el que no es guía, solo las suyas. Es razonable, pero **no es lo que decía el encargo** («solo las que él creó»). Se lo consulto a Cristian; no lo cambies.
