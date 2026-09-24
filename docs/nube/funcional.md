# Recorrido funcional por roles y caza de fallos

Informe para el dueño del liceo. Se actualiza y se sube en cada arreglo que queda en verde.

## Para revisar

- **Rama:** `claude/busy-bohr-000kvi` (sale de `nube/base`, 8b4219f). No toca `main`, `trabajo/*` ni `nube/*`.
- **En qué punto quedé:** siete arreglos hechos y en verde (tabla). La tanda completa del servidor con todos
  ellos: 893 pruebas, 886 pasan; solo fallan las 7 de `tenant-mismatch` que ya fallaban antes. La línea base del
  navegador está corriendo otra vez: la primera falló casi entera porque usa cuentas que ningún sembrado crea
  (ver «Línea base»). Siguen: recorrido por rol en el navegador, fechas cerca de medianoche en la web, normas del
  MPPE (boleta, constancias, asistencia mínima del 75 %).
- **Commits** (uno por arreglo):

| Commit | Qué cambia |
|---|---|
| `b428171` | Un 0 es una nota: el alumno con todo en 0 ya no sale promovido sin pendientes, ni «sin calificar», ni fuera del riesgo; un lapso en 0 cuenta en el ciclo. |
| `afb6c7f` | Cambiar de sección: ya no da error 500, respeta el cupo, y las notas de la sección anterior siguen contando en el promedio. |
| `f82d14a` | El alumno archivado (retirado) deja su sección: no cuenta, no ocupa cupo y no se le reinscribe solo al cerrar el ciclo. |
| `d5bb535` | El representante ve el mismo promedio que su hijo y no recibe «Asistencia baja: 0%» sin registros. |
| `4ce88a5` | Las definitivas se redondean como manda el MPPE (0,50 o más sube al entero), configurable por liceo: un 9,5 ya no queda pendiente. |
| `3c5c769` | Una nota suelta de Clase en Vivo cuenta solo en el lapso en que se puso (antes se sumaba a los tres). |
| `dbdcca9` | Dos pantallas pasando lista en la misma clase ya no se deshacen la una a la otra; un refresco no pisa lo marcado sin guardar. |

- **Cómo probarlo:**
  ```bash
  cd apps/backend && REDIS_PRUEBAS_URL=redis://127.0.0.1:6391 npx jest funcional-   # las pruebas nuevas
  cd apps/backend && REDIS_PRUEBAS_URL=redis://127.0.0.1:6391 npx jest             # todo el servidor
  ```
- **Qué falta y qué queda por decidir:** ver las dos últimas secciones.

## Línea base (antes de tocar nada)

| Tanda | Resultado | Notas |
|---|---|---|
| Servidor (jest) | **859 de 867** pasan, 8 fallan, 103 archivos | Los 8 fallos son de las pruebas, no del liceo (abajo). |
| Tipos del servidor | limpio | |
| Tipos de la web | limpio tras arreglar el entorno | Antes: 2 errores por una dependencia que no se instala (abajo). |
| Web (jest) | **48 de 48** tras arreglar el entorno | Antes: 45 y un archivo que no cargaba. |
| Navegador (Playwright) | midiendo | 210 pruebas. |
| Teléfono (`npm run movil -- --exigir`) | pendiente | |

**Los 8 fallos del servidor que ya estaban:**

- `tenant-mismatch.test.ts` (7): su ayudante crea la base con `prisma db push --accept-data-loss` (lo que
  `CLAUDE.md` prohíbe) y la base nueva no tiene la extensión `pg_trgm` que pide el índice de búsqueda de
  usuarios. Con `migrate deploy` la extensión la crea la migración. Es de la prueba, no del producto.
- `logo-en-la-base.test.ts` LOGO-03 (1): cuenta los logos del liceo de pruebas en la base de la plataforma,
  que comparten todas las pruebas; otra prueba deja uno antes. Es de aislamiento de pruebas.

**Arreglos del entorno (no del producto):**

- `@testing-library/dom` no está en `package.json` y `npm ci --legacy-peer-deps` no instala las dependencias
  «peer»: una prueba de la web no cargaba y los tipos fallaban. Instalada aparte, sin guardar. **Propuesta:**
  añadirla a las `devDependencies` de `apps/web`.
- Esta máquina no tiene IPv6 y el servidor escucha en `::` (`src/index.ts`). Se arrancó con un precargado que
  traduce `::` a `0.0.0.0`, sin tocar el código.
- Playwright 1.62 busca Chromium 1234 y en la máquina está el 1194: se enlazó uno al otro.
- Redis de pruebas en el puerto 6391 (como dice `CLAUDE.md`), aparte del 6379 del servidor.
- El servidor de datos se levantó con `tsx src/index.ts` (lo mismo que `npm run dev`, sin reiniciarse al
  guardar un archivo) para poder corregir mientras corre la tanda del navegador.

## Qué estaba mal y qué le pasaba al liceo

### 1. Un alumno con todo en 0 pasaba por «sin calificar» — **arreglado** (`b428171`)

El sistema decidía si un alumno tenía notas mirando si su promedio era mayor que cero. El que no entregó
nada y sacó 0 quedaba igual que el que todavía no tiene notas. Efectos medidos (CERO-01…07, seis en rojo):

- Al **cerrar el ciclo** salía **promovido sin materia pendiente**.
- En las cifras de la sección **no salía en riesgo** en esa materia.
- En la **lista de la sección** salía «Sin calificar» y su promedio era el de las otras materias (15 en vez de 7,5).
- El **representante no recibía el aviso** de promedio bajo.
- Un **lapso en 0 no contaba** en el promedio del ciclo: 0 y 16 daba 16, no 8.

Ahora el cálculo dice si hay notas además del número, y lo que no tiene notas sigue sin contar, como manda el
mapa de cálculos. La lista enseña el 0 como 0 y el aviso de riesgo dice la nota mínima del liceo (antes un
«< 10» fijo).

**Para `docs/MAPA_DE_CALCULOS.md`** (no lo edito, otra sesión trabaja ahí): en la sección 1, nivel 2, donde
dice «Lapsos sin notas no se dividen», añadir: «Un lapso con notas en 0 SÍ cuenta: sin notas no es lo mismo
que 0. Lo vigilan CERO-01…07 (`funcional-notas-en-cero.test.ts`)».

### 2. Cambiar a un alumno de sección daba error y le borraba las notas — **arreglado** (`afb6c7f`)

Medido con SEC-01…05 (las cinco en rojo):

- **Inscribir en otra sección** a un alumno que ya estaba en una respondía **error 500**. La puerta
  desactivaba la inscripción y creaba otra, pero la base admite una sola por alumno y ciclo. Igual al volver a
  inscribir en otra sección a quien quedó con la inscripción inactiva. Y el cambio **no miraba el cupo**.
- **Las notas de la sección anterior dejaban de contar**: con 18 en la A y 10 en la B su promedio salía 10 (en
  su perfil, en la lista, en su panel y al cerrar el ciclo). Es de las quejas más repetidas de PowerSchool y
  Schoology (ver la lista de casos).
- Con **dos inscripciones activas** (la de este año y la del próximo, hecha por adelantado) el cálculo cogía
  una cualquiera para buscar el plan de evaluación.

Ahora la inscripción se cambia de sitio (con cupo), un doble clic responde «ya inscrito» (409) y no 500, y las
notas del lapso salen de su sección de ese ciclo y de las otras del mismo ciclo donde tiene notas.

**Para `docs/MAPA_DE_CALCULOS.md`**, nivel 2: «Si el alumno se cambió de sección, sus criterios salen de su
sección y de las otras del mismo ciclo donde tiene notas; el promedio se escala a los puntos calificados
(`seccionesDelAlumno`). SEC-04/05.»

### 3. El alumno retirado seguía ocupando su puesto — **arreglado** (`f82d14a`)

Retirar a un alumno a mitad de año es «Archivar usuario», y eso apagaba solo la cuenta: la inscripción seguía
activa. El retirado **contaba en el total de la sección, ocupaba cupo** (no se podía inscribir a otro en su
puesto) y **al cerrar el ciclo se le proponía para el año siguiente**. Ahora archivarlo deja su inscripción
inactiva (no se borra, conserva notas e historial) y desarchivarlo lo devuelve a su sección si hay cupo.
RET-01…04, tres en rojo antes.

### 4. El representante veía otro promedio y avisos falsos — **arreglado** (`d5bb535`)

- Su panel calculaba el promedio del hijo con la media a pelo de la tabla de notas antigua, **sin las notas de
  Clase en Vivo** (donde se ponen casi todas) ni el plan de evaluación. A un hijo que iba con **8** le salía
  **0**, y la familia no recibía el aviso de promedio bajo. Ahora usa el mismo cálculo que el panel del alumno.
- Al **empezar cada lapso**, antes de pasar lista, todas las familias recibían **«Asistencia baja: 0%»**. Ahora
  hace falta al menos un registro en el lapso. REP-01…02, las dos en rojo antes.

**Para `docs/MAPA_DE_CALCULOS.md`**, sección 4, fila «Panel del representante»: «Sin ningún registro de
asistencia en el lapso no hay aviso (REP-02)». Y en la sección 1: «El promedio que ve el representante es el
mismo que el del panel del alumno: media de las materias con notas (nivel 2), a un decimal (REP-01)».

### 5. Un 9,5 quedaba como materia pendiente — **arreglado** (`4ce88a5`)

Al cerrar el ciclo, la definitiva salía con decimales y así se comparaba con la mínima: **un 9,5 quedaba
pendiente**. El Reglamento General de la Ley Orgánica de Educación manda que, al calcular, una fracción de
0,50 o más suba al entero inmediato superior, y la mínima es 10 (fuentes abajo). Ahora hay una regla del liceo,
`redondeoDeDefinitivas`, en Configuración → Académico:

- **MPPE** (por defecto): cada lapso al entero y la definitiva, de esos, al entero otra vez.
- **Sin redondear**: dos decimales, como antes.

Durante el año (riesgo, promedios de la sección) no cambia nada. RED-01…05, cuatro en rojo antes.

**Para `docs/MAPA_DE_CALCULOS.md`**, sección 6 o una nueva «Definitivas»: «Al cerrar el ciclo, con
`redondeoDeDefinitivas = 'MPPE'` (por defecto) la nota de cada lapso se redondea al entero (≥ 0,50 sube) y la
definitiva de la materia es la media de esas, redondeada igual. Con 'NINGUNO', a dos decimales. RED-01…05.»

### 6. Las notas sueltas de Clase en Vivo se sumaban a los tres lapsos — **arreglado** (`3c5c769`)

Sin plan de evaluación, las notas de Clase en Vivo que no cuelgan de un criterio («sueltas») entraban en
**todos** los lapsos: un 20 del primero aparecía también en el segundo y el tercero. Un alumno con 16 en el
segundo lapso salía con 18. Ahora la nota de un criterio es del lapso del criterio, y la suelta, del lapso de su
fecha (la de la clase; si no, la de entrega; si no, la de creación). LAP-01…03, las tres en rojo antes.

**Para `docs/MAPA_DE_CALCULOS.md`**, nivel 0: «Una actividad de Clase en Vivo es del lapso de su criterio; sin
criterio, del lapso de la fecha de su clase (o de entrega, o de creación). Una fecha entre lapsos va al que
acaba de terminar. `utils/lapso-de-la-actividad.ts`, LAP-01…03.»

### 7. Dos pantallas en la misma clase se deshacían lo marcado — **arreglado** (`dbdcca9`)

La clase en vivo se guarda sola, y cada guardado mandaba la asistencia de **todos** los alumnos con lo que
tenía esa pantalla. Con dos pantallas abiertas (el profesor en el teléfono y la coordinadora en el ordenador, o
el mismo profesor en dos aparatos), si una no se había enterado de lo que marcó la otra, al guardar lo suyo
**devolvía el ausente a «presente»**. Además, cada refresco reemplazaba lo marcado y aún no enviado, y el texto
de la observación que se estaba escribiendo. Ahora se manda solo lo tocado; los alumnos sin asistencia ese día
van «solo si no hay»; y lo pendiente se respeta al refrescar. SOLO-01 en rojo antes; ASIS-DOS-01 lo recorre con
dos navegadores.

## Qué se probó y qué no

(en curso)

## Casos sacados de las quejas de otros sistemas

(en curso: la lista con su fuente y su resultado)

## Qué queda por decidir

(en curso)
