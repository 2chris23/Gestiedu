# Matriz de permisos medida (ruta × quien llama)

Generada por `tests/integration/quien-puede-que.test.ts` con `ESCRIBIR_MATRIZ=1`.
Cada celda: código HTTP obtenido. ✅ = lo esperado; ❌ = no lo esperado; · = no se exige (duda).
Esperado: **S** = debe poder (2xx/404 de negocio), **N** = no debe (401/403/404).

| Qué | anonimo | admin | profeA | guiaA | profeB | alumnaA | alumnoB | repA | repB | otroLiceo |
|---|---|---|---|---|---|---|---|---|---|---|
| GET nota de alumnaA | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | N 403 ✅ | S 200 ✅ | N 403 ✅ | S 200 ✅ | N 403 ✅ | N 401 ✅ |
| GET notas por alumno | N 401 ✅ | S 200 ✅ | · 403 · | · 403 · | N 403 ✅ | S 200 ✅ | N 403 ✅ | · 403 · | N 403 ✅ | N 401 ✅ |
| GET notas de una actividad de A | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | N 200 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET notas de la materia (lista) | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | sin fuga 200 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET lista de notas | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | sin fuga 200 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET estadísticas de notas | N 401 ✅ | S 200 ✅ | · 200 · | · 200 · | · 200 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET asistencia de alumnaA | N 401 ✅ | S 200 ✅ | S 200 ✅ | S 200 ✅ | N 403 ✅ | S 200 ✅ | N 403 ✅ | S 200 ✅ | N 403 ✅ | N 401 ✅ |
| GET un registro de asistencia | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | N 403 ✅ | · 200 · | N 403 ✅ | · 200 · | N 403 ✅ | N 401 ✅ |
| GET asistencia de la sección A | N 401 ✅ | S 200 ✅ | S 200 ✅ | S 200 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET asistencia de A en un día | N 401 ✅ | S 200 ✅ | S 200 ✅ | S 200 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET resumen de asistencia de A | N 401 ✅ | S 200 ✅ | S 200 ✅ | S 200 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET observaciones de alumnaA | N 401 ✅ | S 200 ✅ | S 200 ✅ | S 200 ✅ | N 403 ✅ | · 200 · | N 403 ✅ | · 200 · | N 403 ✅ | N 401 ✅ |
| GET observaciones de la sección A | N 401 ✅ | S 200 ✅ | S 200 ✅ | S 200 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET una actividad de A | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 403 · | N 403 ✅ | S 200 ✅ | N 403 ✅ | · 200 · | N 200 ❌ | N 401 ✅ |
| GET actividades de la sección A | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | N 200 ❌ | S 200 ✅ | N 200 ❌ | · 200 · | N 200 ❌ | N 401 ✅ |
| GET actividades de la materia | N 401 ✅ | S 200 ✅ | · 200 · | · 200 · | · 200 · | · 200 · | · 200 · | · 200 · | sin fuga 200 ❌ | N 401 ✅ |
| GET lista de actividades | N 401 ✅ | S 200 ✅ | · 200 · | · 200 · | · 200 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET sección A | N 401 ✅ | S 200 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | · 200 · | N 200 ❌ | · 200 · | N 200 ❌ | N 401 ✅ |
| GET estadísticas (promedios) de A | N 401 ✅ | S 200 ✅ | · 200 · | S 200 ✅ | N 200 ❌ | N 200 ❌ | N 200 ❌ | N 200 ❌ | N 200 ❌ | N 401 ✅ |
| GET estadística de la sección A | N 401 ✅ | S 200 ✅ | · 200 · | S 200 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET estadística de la materia en A | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET materias de la sección A | N 401 ✅ | S 200 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET alumnos de la materia | N 401 ✅ | S 200 ✅ | · 200 · | · 200 · | sin fuga 200 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET lista de alumnos | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | · 200 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET ficha de alumnaA | N 401 ✅ | S 200 ✅ | · 403 · | · 403 · | N 403 ✅ | S 200 ✅ | N 403 ✅ | · 403 · | N 403 ✅ | N 401 ✅ |
| GET panel de alumnaA | N 401 ✅ | S 200 ✅ | · 403 · | · 403 · | N 403 ✅ | S 200 ✅ | N 403 ✅ | · 403 · | N 403 ✅ | N 401 ✅ |
| GET actividades de alumnaA | N 401 ✅ | S 200 ✅ | · 200 · | · 200 · | N 403 ✅ | S 200 ✅ | N 403 ✅ | S 200 ✅ | N 403 ✅ | N 401 ✅ |
| GET historial de alumnaA | N 401 ✅ | S 200 ✅ | · 403 · | · 403 · | N 403 ✅ | S 200 ✅ | N 403 ✅ | · 403 · | N 403 ✅ | N 401 ✅ |
| GET usuario alumnaA | N 401 ✅ | S 200 ✅ | · 403 · | · 403 · | N 403 ✅ | S 200 ✅ | N 403 ✅ | · 403 · | N 403 ✅ | N 401 ✅ |
| GET foto de alumnaA | N 401 ✅ | · 404 · | · 404 · | · 404 · | N 404 ✅ | · 404 · | N 404 ✅ | · 404 · | N 404 ✅ | N 401 ✅ |
| GET representantes de alumnaA | N 401 ✅ | S 200 ✅ | N 403 ✅ | · 403 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | · 403 · | N 403 ✅ | N 401 ✅ |
| GET boletín de alumnaA | N 401 ✅ | S 200 ✅ | · 200 · | · 200 · | N 403 ✅ | S 200 ✅ | N 403 ✅ | S 200 ✅ | N 403 ✅ | N 401 ✅ |
| GET aviso de alumnaA | N 401 ✅ | · 404 · | N 404 ✅ | N 404 ✅ | N 404 ✅ | S 200 ✅ | N 404 ✅ | N 404 ✅ | N 404 ✅ | N 401 ✅ |
| GET avisos de alumnaA | N 401 ✅ | S 200 ✅ | N 200 ❌ | N 200 ❌ | N 200 ❌ | · 403 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET todos los avisos | N 401 ✅ | S 200 ✅ | sin fuga 200 ❌ | sin fuga 200 ❌ | sin fuga 200 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET horario de la sección A | N 401 ✅ | S 200 ✅ | S 200 ✅ | S 200 ✅ | N 403 ✅ | S 200 ✅ | N 403 ✅ | S 200 ✅ | N 403 ✅ | N 401 ✅ |
| GET un horario de A | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | · 200 · | · 200 · | N 200 ❌ | · 200 · | N 200 ❌ | N 401 ✅ |
| GET horario de profeA | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | · 200 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET clase en vivo de A | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | N 403 ✅ | · 200 · | N 403 ✅ | · 200 · | N 403 ✅ | N 401 ✅ |
| GET plan de evaluación de A | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | N 403 ✅ | · 403 · | N 403 ✅ | · 403 · | N 403 ✅ | N 401 ✅ |
| GET cabecera del plan de A | N 401 ✅ | S 200 ✅ | S 200 ✅ | · 200 · | N 200 ❌ | · 200 · | N 200 ❌ | · 200 · | N 200 ❌ | N 401 ✅ |
| GET buscar alumnos | N 401 ✅ | S 200 ✅ | · 200 · | · 200 · | sin fuga 200 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| GET panel del representante | N 401 ✅ | · 403 · | · 403 · | · 403 · | · 403 · | · 403 · | · 403 · | S 200 ✅ | S 200 ✅ | N 401 ✅ |
| GET usuarios (lista) | N 401 ✅ | S 200 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST nota a alumnaA | N 401 ✅ | · 400 · | S 201 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| PUT nota de alumnaA | N 401 ✅ | S 200 ✅ | S 200 ✅ | N 200 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST notas en bloque | N 401 ✅ | · 400 · | · 409 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST asistencia a alumnaA | N 401 ✅ | · 409 · | S 409 ✅ | · 409 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| PUT registro de asistencia | N 401 ✅ | · 200 · | S 200 ✅ | · 200 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST asistencia en bloque | N 401 ✅ | · 201 · | · 201 · | · 201 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST observación a alumnaA | N 401 ✅ | · 400 · | S 400 ✅ | · 400 · | N 400 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| PUT actividad de A | N 401 ✅ | · 200 · | S 200 ✅ | · 403 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST actividad en A | N 401 ✅ | · 400 · | S 400 ✅ | · 400 · | N 400 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST inscribir alumnoB en A | N 401 ✅ | · 500 · | N 500 ❌ | N 500 ❌ | N 500 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST asignarse una materia en A | N 401 ✅ | · 400 · | N 201 ❌ | N 400 ❌ | N 400 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| PUT horario de A | N 401 ✅ | · 200 · | · 200 · | · 200 · | N 200 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| PUT datos de alumnaA | N 401 ✅ | · 200 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| PUT su propio perfil (alumno) | N 401 ✅ | · 404 · | · 403 · | · 403 · | · 403 · | N 403 ✅ | N 403 ✅ | · 403 · | · 403 · | N 401 ✅ |
| PUT su propio perfil (profesor) | N 401 ✅ | · 404 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | · 403 · | · 403 · | · 403 · | · 403 · | N 401 ✅ |
| PUT su propio perfil (usuario) | N 401 ✅ | · 200 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| PATCH marcar leído el aviso de alumnaA | N 401 ✅ | · 403 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | · 200 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST abrir clase en A | N 401 ✅ | · 201 · | · 201 · | · 201 · | N 201 ❌ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST asistencia a alumnoB en la sección A | N 401 ✅ | · 403 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST asistencia en bloque con alumnoB en A | N 401 ✅ | · 403 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| DELETE registro de asistencia | N 401 ✅ | · 404 · | · 200 · | · 404 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| DELETE sacar a alumnaA de A | N 401 ✅ | · 404 · | N 200 ❌ | N 404 ✅ | N 404 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
| POST subir foto de alumnaA | N 401 ✅ | · 406 · | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 403 ✅ | N 401 ✅ |
