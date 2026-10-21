# Revisión de la Fase E — NO APROBADA TODAVÍA (Claude, 2026-10-08)

Lo revisado: el diff, `tsc` y jest de la web (121), la tanda del servidor y **peticiones reales y fotos a 390 px** con `est0575` (alumna de 5.º D) y `tutor.prueba` (su representante, un solo hijo).

## Bien

- **Privacidad:** probé como alumno y como representante 11 rutas de su propia sección (estadísticas, alumnos, notas, observaciones, asistencia, resumen final…). Las que tienen datos de compañeros dan **403**; ninguna respuesta trae cédulas ni notas de otros. La lista de secciones ya da solo la suya.
- **El alumno no tiene botones de escribir** en Académico, Materias, Horarios ni Actividades.
- El menú esconde «Mi sección guía» al que no guía. CLAUDE.md anotado.

## Lo que hay que arreglar

1. **Al representante le salen vacías las cuatro pantallas** si entra sin `?alumno=`:
   - Académico: «No hay datos académicos disponibles para este ciclo escolar».
   - Materias: «No hay materias asignadas».
   - Horarios: «No hay sección asignada: el estudiante no está inscrito…».

   Su hija tiene 15 materias. **Con un solo representado, se elige solo**; con varios, el selector aparece **antes** de pedir nada y nunca un «no hay datos» que parezca un error. Prueba de navegador: `tutor.prueba` abre las cuatro pantallas **sin** `?alumno=` y ve las materias de su hija.

2. **Académico del alumno: a mitad de año dice «definitiva» y «APROBADA».**
   - Hoy es octubre (1.er lapso en curso) y la pantalla abre en **«Ciclo completo»**, con «Promedio general 15,5 · Definitiva del ciclo» y cada materia «Calificación definitiva · APROBADA».
   - Eso todavía no existe: el año no ha terminado.
   - **Que abra en el lapso en curso.** En «Ciclo completo» con el ciclo en curso: «Promedio hasta hoy» y, por materia, «Va aprobando» / «En riesgo», nunca «definitiva» ni «aprobada». Lo definitivo, solo con el ciclo cerrado (mira cómo lo hace la boleta: sin definitiva hasta el cierre).

3. **Dos promedios distintos para la misma alumna:** el Inicio dice **15,3** y Académico **15,5**. Averigua de dónde sale cada uno (lapso o ciclo, materias con apreciación, redondeo) y que **la misma pregunta dé el mismo número en las dos pantallas**. Pon en el informe el cálculo a mano de los dos contra la base. Si uno está mal, arréglalo; si miden cosas distintas, que la etiqueta lo diga («del 1.er lapso» frente a «hasta hoy»). Anótalo en `MAPA_DE_CALCULOS.md`.

4. **`MENU-PARIDAD` en rojo** (`precarga.test.ts`, en la tanda completa del servidor: 1 de 1.359). Escondiste «Mi sección guía» al que no guía **solo en el menú de la web**; el del servidor (`paquete-de-precarga.service.ts`) la sigue dando. Los dos menús tienen que decidir igual (también para el paquete). Pasa el «¿guía alguna?» a los dos, y la prueba debe cubrir un profesor que guía y uno que no.

## Para aprobar

- Los 3 puntos, con las salidas reales y las fotos de las cuatro pantallas del representante y de Académico del alumno.
- typecheck, `tsc`, jest del servidor (con Redis 6391) y de la web en verde; `npm run movil -- --exigir`.

---

# Segunda revisión de la Fase E (Claude, 2026-10-08)

Comprobado en el navegador (alumna `est0575` y `tutor.prueba`, 390 px): **los puntos 1, 2 y 4 están bien.** El representante ve las cuatro pantallas de su hija sin `?alumno=`, Académico abre en el 1.er lapso, en «Ciclo completo» ya no dice «definitiva» ni «aprobada», y MENU-PARIDAD está en verde.

## Falta el punto 3: se cambió la etiqueta, no el número

Ahora las dos pantallas dicen lo mismo con números distintos:
- Inicio: «**Promedio hasta hoy** 15.3».
- Académico → Ciclo completo: «**Promedio hasta hoy** 15.5».

La misma pregunta tiene que dar **un solo número**. **Decisión:** vale **el de la boleta** (15,5: cada materia con el redondeo del liceo, `redondeoDeDefinitivas`). Es el oficial, el que sale en papel, y el mismo que ya usa el cuadro de honor («el promedio es el de la boleta», CLAUDE.md).

- El Inicio del alumno y el del representante (por hijo y el «de tus representados») deben dar **el número de la boleta**. Usa la misma cuenta que la boleta (`boleta.service.ts`), no una copia aparte que se pueda desviar.
- El representante tiene pocos hijos (1–3): una cuenta por hijo es aceptable, pero **en paralelo** y que N1-* no crezca con el número de **alumnos de la sección**.
- Prueba del servidor: para un alumno con notas conocidas, `/dashboard/student`, `/dashboard/tutor` y la boleta dan **el mismo promedio**. Y la de navegador: el número del Inicio es igual al de Académico.
- Corrige `MAPA_DE_CALCULOS.md` §7.6: un solo promedio general del alumno, el de la boleta.
