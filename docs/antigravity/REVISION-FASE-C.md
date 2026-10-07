# Revisión de la Fase C — NO APROBADA TODAVÍA (Claude, 2026-10-07)

Lo revisado: el diff, typecheck, jest de la web (121) y del servidor (panel, N1-*, cuadro de honor: 25), y **fotos de los tres Inicios en un teléfono de 390 px** con los datos de `instituto-testing` (profesor3, est0575, tutor.prueba).

**Bien:** la pieza `InicioMovil`, el Inicio del alumno (se ve correcto), la regla del top 10 en el cuadro de honor y el N1-06 constante.

## Ya corregido por Claude (no lo deshagas)

- **El promedio del profesor se quedaba viejo hasta 1 hora** después de poner notas: había una copia propia en Redis (`stats:teacher:…`, `CACHE_TTL.LONG`) que nada borraba. Se quitó: `/api/dashboard` ya se guarda entero 5 min en la memoria general.
- La prueba que exigía esa copia se cambió por una que exige lo contrario: si cambia una nota, el promedio cambia (`panel-del-profesor.test.ts`).

## Lo que hay que arreglar

1. **El Inicio del profesor se contradice** (foto de `profesor3`): «Promedio de mis clases 13.8» y «En riesgo 4», pero debajo «**0 estudiantes · 0 secciones**» y «Asistencia **0 %**».
   - `classrooms` solo busca donde es guía (`teacherId`) o en `teachers`. **No incluye las secciones donde imparte una materia** (`classroom_subjects.teacherId`), que son las que importan. Usa el mismo criterio que `las-secciones-que-me-tocan.test.ts`, y del ciclo activo.
   - La asistencia filtra por `dailyAttendance.teacherId` (quién la pasó). Lo pedido es **la asistencia de sus secciones**: filtra por `classroomId` en esas secciones, últimos 30 días, **con la fecha del liceo** (`utils/school-time.ts`), no `new Date()` del servidor.
   - Prueba nueva en `panel-del-profesor.test.ts`: un profesor que **solo imparte** (no guía) ve sus secciones, sus alumnos y su asistencia, distintos de 0.
2. **La barra de abajo del representante está mal** (foto de `tutor.prueba`): «Mi cuenta» a la izquierda e **«Inicio» pegado al borde derecho y cortado**. Inicio va en el centro, como en los demás roles. Comprueba si ya estaba así antes de esta fase (`git stash`) y dilo en el informe; se arregla igual.
3. **`tests/e2e/helpers.ts`:** ahora un 503 al entrar se trata como «frenado por el límite» y se reintenta. Un 503 al entrar es la base saturada: reintentarlo en las pruebas **esconde** un fallo de verdad. Quítalo, o explica qué prueba fallaba y por qué el 503 era legítimo.
4. Después de lo anterior: `npm run movil -- --exigir` con los tres roles y fotos nuevas de los tres Inicios en el informe.

## Para aprobar

- Los 4 puntos, con las salidas reales.
- typecheck, `tsc`, jest del servidor (con Redis 6391) y de la web en verde.
- Las fotos de los Inicios de profesor, alumno y representante.
