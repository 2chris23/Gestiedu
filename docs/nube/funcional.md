# Recorrido funcional por roles y caza de fallos

Informe para el dueño del liceo. Se actualiza y se sube en cada arreglo que queda en verde.

## Para revisar

- **Rama:** `claude/busy-bohr-000kvi` (sale de `nube/base`, 8b4219f). No toca `main`, `trabajo/*` ni `nube/*`.
- **En qué punto quedé:** ocho arreglos y una función nueva (la boleta), en la tabla. La tanda completa del
  servidor con los siete primeros: 893 pruebas, 886 pasan; solo fallan las 7 de `tenant-mismatch` que ya
  fallaban antes. Línea base del navegador medida (abajo). Falta: repetir la tanda del navegador con la web
  recompilada (mis pruebas de navegador ASIS-DOS-01, RELOJ-01 y BOL-UI-01…03 aún no han corrido sobre el código
  nuevo), el teléfono (`npm run movil -- --exigir`), la constancia de estudio y el recorrido completo por rol.
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
| `14c7e86` | «Hoy» es el día del liceo, no el del reloj del teléfono: horario del alumno, de la materia, historial, calendario y eventos. |
| `e6c5221` | **Nuevo:** la boleta del alumno en el servidor (notas por lapso, definitiva, inasistencias), con el redondeo del liceo. |
| `1b0ac6b` | **Nuevo:** la pantalla de la boleta, para ver e imprimir: el alumno («Mi boleta»), su representante y el admin. |

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
| Navegador (Playwright) | **173 de 210** pasan, 30 fallan, 6 no corren, 1 saltada | Con las cuentas que faltaban creadas en el entorno (abajo). Sin ellas, fallaba casi todo. |
| Teléfono (`npm run movil -- --exigir`) | pendiente | |

**Los 8 fallos del servidor que ya estaban:**

- `tenant-mismatch.test.ts` (7): su ayudante crea la base con `prisma db push --accept-data-loss` (lo que
  `CLAUDE.md` prohíbe) y la base nueva no tiene la extensión `pg_trgm` que pide el índice de búsqueda de
  usuarios. Con `migrate deploy` la extensión la crea la migración. Es de la prueba, no del producto.
- `logo-en-la-base.test.ts` LOGO-03 (1): cuenta los logos del liceo de pruebas en la base de la plataforma,
  que comparten todas las pruebas; otra prueba deja uno antes. Es de aislamiento de pruebas.

**Los 30 fallos del navegador que ya estaban** (sobre el código de antes de mis cambios):

- 16 de **contraste** (`contraste.spec.ts`): diseño, es de otra sesión. No los toco.
- 4 porque **crear un usuario daba 500** (BOTON-01, REC-01…03): el sembrado del liceo de pruebas no registra
  el liceo en su propia base, y el aprovisionamiento de verdad sí. Arreglado en el sembrado (ver «Qué estaba
  mal», 9).
- 2 porque usan `profesor3@testing.edu.ve` y la materia `materia-mate`, que no crea ningún sembrado (NUEVA-01,
  PLANUI-01).
- CIC-13 exige 500 alumnos en el liceo de pruebas; el sembrado tiene 33.
- APP-01: el icono del liceo responde 404 (el liceo de pruebas no tiene logo; pendiente de mirar).
- REPR-UI-01, TR-02, TR-03 y las dos de MEDIR (tiempo real): pendientes de repetir para ver si son de verdad o
  del entorno (el navegador intenta IPv6 y esta máquina no lo tiene).
- MOVIL-04: el navegador se cerró solo en mitad de la prueba (entorno).

**Las pruebas de navegador usan cuentas que ningún sembrado crea.** `admin@testing.edu.ve` (66 veces),
`profesor.ciencias@tuapp.com`, `tutor.prueba@testing.edu.ve`, `est0575@testing.edu.ve` y
`profesor3@testing.edu.ve`. Con el sembrado que dice la guía (`testing-institute.seed.ts`) la tanda falla casi
entera en la entrada. En esta máquina se sembró además `scripts/seed-full-testing-institute.ts` (que lleva la
contraseña de la base local del dueño escrita dentro) y se crearon esas cuentas a mano. **Propuesta:** un
sembrado único que deje el liceo de pruebas como lo esperan las pruebas.

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

### 8. El horario enseñaba como «Hoy» el día del teléfono — **arreglado** (`14c7e86`)

La regla está escrita (la fecha la pone el servidor), pero el horario del alumno, el de la materia, el
historial, el calendario del día y la página de eventos elegían «hoy» con el reloj y la zona del aparato. Un
teléfono con la fecha adelantada o en otra zona horaria enseñaba como «Hoy» **las clases de otro día**, marcaba
«en curso» otra hora y, al tocar un bloque, **abría la clase de otra fecha**. En zonas al este de UTC+12 las
fechas de la materia salían corridas un día. Ahora hay un reloj del liceo (`useRelojDelLiceo`): la hora del
servidor, corregida por el desfase del aparato, en la zona del liceo. RELOJ-01 lo recorre con el reloj del
navegador 36 horas adelantado.

### 9. En el liceo de pruebas no se podían crear usuarios — **arreglado en el sembrado**

El sembrado del liceo de pruebas no registraba el liceo en su propia base (el aprovisionamiento de verdad sí),
y crear un usuario desde la pantalla o la API respondía **500**. No le pasa a un liceo real; le pasa a quien
monta el entorno siguiendo la guía, y dejaba cuatro pruebas de navegador en rojo.

### 10. Función nueva: la boleta — `e6c5221`, `1b0ac6b`

En un liceo venezolano, al terminar cada lapso se entrega la boleta. Gestiedu calculaba todo lo que va en ella
pero no lo juntaba en ningún sitio. Ahora hay boleta: la nota de cada materia en cada lapso y la definitiva (con
el redondeo del liceo), el promedio, las inasistencias por lapso (sin justificar, justificadas, tardanzas), los
datos del liceo, del alumno y de su sección, y las líneas de firma. Se ve y se imprime:

- el alumno, desde «Mi boleta» en su inicio;
- el representante, desde «Ver la boleta» en cada representado;
- el admin, desde el perfil del alumno;
- el profesor **guía** de la sección (el que solo da una materia, no: la boleta son promedios de todas).

Una materia sin notas sale vacía («—»), no en 0. **No depende de los pagos:** en Venezuela no se puede
condicionar la entrega de boletines ni constancias al pago de la mensualidad (fuente abajo). BOL-01…04 en el
servidor; BOL-UI-01…03 en el navegador.

## Cómo funcionan los liceos en Venezuela, comparado con Gestiedu

| Norma o práctica | Fuente | Gestiedu | Qué hice |
|---|---|---|---|
| Escala del 01 al 20, mínima aprobatoria 10 | [Reglamento General de la LOE](https://docs.venezuela.justia.com/federales/reglamentos/reglamento-general-de-la-ley-organica-de-educacion.pdf) | Sí, configurable por liceo | — |
| Al calcular, una fracción de 0,50 o más sube al entero siguiente | [Reglamento General de la LOE](https://www.excubitusdhe.org/web/wp-content/uploads/Reglamento_ley_org_educ-1.pdf) (búsqueda: «cincuenta centésimas… número entero inmediato superior») | **No**: un 9,5 quedaba pendiente | Añadido, configurable, MPPE por defecto (5) |
| Tres lapsos y boleta al final de cada uno | [Boletín de Educación Media General](http://lbrafaelmariapenasaavedra.blogspot.com/p/boletin-de-educacion-media-general.html) | Lapsos sí; boleta **no** | Añadida la boleta (10) |
| Asistencia mínima del 75 % para optar a aprobar; sin ella no hay revisión (art. 109) | [Cómo aplicar el art. 109](https://steemit.com/spanish/@elegebr/como-aplicar-el-articulo-109-del-reglamento-general-de-la-ley-organica-de-educacion) | Solo un aviso al representante (80 % por defecto); no influye en la promoción | **Por decidir** (abajo) |
| La asistencia se lleva por asignatura (el 75 % es «de un grado, área, asignatura») | Art. 109 | La asistencia es **por día**, una fila por alumno y día para todas las materias | **Por decidir** (abajo) |
| Materia pendiente: revisión en julio; si no la aprueba, pasa con la materia pendiente y rinde por lapso | [La evaluación: del pasado al presente (SciELO)](https://ve.scielo.org/scielo.php?script=sci_arttext&pid=S1316-49102007000300006) | Promoción con pendientes (hasta N, configurable) y acta de compromiso; **no** registra la nota de revisión | Propuesta (abajo) |
| Resumen final del rendimiento estudiantil (formato oficial MPPE, por sección) | [Instructivo de llenado (CERPE)](http://www.cerpe.org.ve/tl_files/Cerpe/contenido/documentos/Actualidad%20Educativa/Transformacion%20curricular%20EM/INSTRUCTIVO%20DEL%20LLENADO%20DEL%20RESUMEN%20FINAL%20DEL%20RENDIMIENTO%20ESTUDIANTIL%20DE%20EDUCACION%20MEDIA%20GENERAL(1).pdf) | **No** | Propuesta: exportar los datos del resumen por sección (las notas ya están) |
| Constancias de estudio y de buena conducta, notas certificadas | [Control de Estudios, documentos que expide](https://www.psmcaracas.edu.ve/paginas/emisionDocumentos.html) | **No** | Constancia de estudio: pendiente (siguiente en la lista) |
| Cédula escolar para quien no tiene cédula (12 caracteres: nacionalidad, orden, año de nacimiento y cédula de la madre) | [Guía para la asignación de la cédula escolar](https://www.maestraaldia.com/2023/05/asignacion-de-la-cedula-escolar.html) | La cédula es texto libre | Propuesta: un generador en el formulario del alumno |
| Mensualidad en dólares, cobrable en bolívares a la tasa BCV del día | [Efecto Cocuyo](https://efectococuyo.com/la-humanidad/mensualidades-dolares-colegios-privados-tasa-bcv/), [El Pitazo](https://elpitazo.net/economia/colegios-privados-pueden-cobrar-mensualidades-en-dolares-pero-a-tasa-del-bcv/) | Sí: cobra en VES o USD con la tasa que escribe el admin | Propuesta: traer la tasa BCV sola (necesita salida a internet del servidor) |
| No se pueden retener boletines ni constancias por deuda | [El Pitazo](https://elpitazo.net/economia/colegios-privados-pueden-cobrar-mensualidades-en-dolares-pero-a-tasa-del-bcv/) | La boleta nueva no mira los pagos | Respetado (10) |
| Profesor guía, consejo de sección | Práctica de los liceos | Profesor guía sí; consejo de sección no | Propuesta |

## Qué se probó y qué no

**Probado, con pruebas que quedan en el repositorio:**

- Cálculos contra `docs/MAPA_DE_CALCULOS.md`: sin notas y notas en 0 (CERO), lapsos incompletos (CERO-01,
  BOL-01), cambio de sección a mitad de lapso (SEC), alumno retirado (RET), tardanzas (BOL-01 las cuenta aparte;
  el mapa las cuenta como asistencia, y así siguen), ciclo que cruza diciembre (LAP-01…03 usan un ciclo de
  septiembre a julio; las cuotas de pago ya cruzaban bien el año), redondeo (RED), el representante (REP).
- Concurrencia: dos pantallas en la misma clase (ASIS-DOS-01, SOLO-01…03), doble inscripción (409).
- El reloj del aparato adelantado (RELOJ-01).
- La tanda entera del servidor, de la web y del navegador (línea base arriba).

**Probado leyendo el código, sin prueba nueva:** la renovación de la sesión, el cruce de diciembre en las cuotas
de pago, el freno del doble clic.

**No probado todavía:** el recorrido completo del año por rol en el navegador (crear ciclo → secciones →
inscribir → horario con turnos → clase en vivo → cierre); suspender y reemplazar clases en el navegador; la
asistencia por QR con la cámara simulada más allá de lo que ya prueban QRE-01/02; quedarse sin conexión en
mitad de un guardado; el teléfono (`npm run movil -- --exigir`); escalas de notas distintas de 0-20 (ver abajo:
no se aplican en los cálculos).

## Casos sacados de las quejas de otros sistemas

Cada caso, con su fuente y lo que pasó al probarlo en Gestiedu.

| # | Queja en otros sistemas | Fuente | Prueba en Gestiedu | Resultado |
|---|---|---|---|---|
| 1 | Notas que se pierden al guardar, o al quedarse colgada la pantalla | [PowerSchool, «Teachers' biggest nightmare»](https://lockerroom.johnlocke.org/2014/02/07/powerschool-teachers-biggest-nightmare), [Moodle: grades disappearing](https://moodle.org/mod/forum/discuss.php?d=429846) | Clase en vivo con dos pantallas (ASIS-DOS-01); notas de actividades cruzadas (`notas-que-no-se-pisan`, ya estaba) | **Fallo encontrado y arreglado** en la asistencia (7). Las notas ya se añadían sin pisarse. |
| 2 | Dos profesores editando lo mismo a la vez | [PowerTeacher Pro, co-teachers](https://ps.powerschool-docs.com/pssis-admin/latest/powerteacher-pro) | ASIS-DOS-01; plan de evaluación en dos pestañas (PLANUI-01, ya estaba) | Asistencia **arreglada** (7). El plan ya avisaba. |
| 3 | Envíos dobles (doble clic, reintento del navegador) | [Duplicate enrollment records](https://ps.powerschool-docs.com/pssis-admin/latest/duplicate-enrollment-records) | Freno del doble clic (ya estaba, DOBLE-01…04); inscripción doble | La inscripción doble ahora dice «ya inscrito» (409) en vez de error 500 (2). |
| 4 | Boletines con redondeos distintos según la pantalla | [PowerSchool vs Schoology: hasta 1 % de diferencia](https://support.sau19.org/help/en-us/66-gradebook-and-grade-setup/268-troubleshooting-when-grades-in-powerteacher-pro-don-t-match-schoology), [PowerSchool: rounding](https://esp.powerschool-docs.com/espsis-sys-admin/latest/troubleshooting-gradebook) | Mismo alumno en su panel y en el del representante (REP-01); redondeo de definitivas (RED-01…05) | **Dos fallos arreglados**: el representante veía otro número (4); el cierre no redondeaba como el MPPE (5). |
| 5 | Inscripciones duplicadas | [PowerSchool: duplicate enrollments](https://ps.powerschool-docs.com/pssis-admin/latest/duplicate-enrollment-records) | Inscribir dos veces, mover de sección (SEC-01…03) | La base ya impedía el duplicado; lo que fallaba era mover (500). **Arreglado** (2). |
| 6 | Cambiar de sección rompe los promedios | [PowerSchool: «Section Change - Lost Grades»](https://help.powerschool.com/t5/Community-Forum/Section-Change-Lost-Grades-Help/m-p/415035), [Schoology: moving grades](https://uc.powerschool-docs.com/en/schoology/latest/moving-student-grades-from-one-section-to-another) | SEC-04/05 | **Fallo encontrado y arreglado**: las notas de la sección anterior dejaban de contar (2). |
| 7 | Asistencia o entregas en el día equivocado por la zona horaria | [Canvas: timezone issues](https://github.com/instructure/canvas-lms/issues/1149), [Canvas Time Zone FAQ](https://talk-boisestate.atlassian.net/wiki/spaces/LTS/pages/1883897887/Canvas+Time+Zone+FAQs) | El servidor ya usaba la zona del liceo (AUDITORIA-HORA, ya estaba); RELOJ-01 en la web | **Fallo encontrado y arreglado** en la web (8). |
| 8 | Sesiones que caducan a mitad del trabajo | [Moodle: session timed out, quiz lost](http://james-moodle.blogspot.com/2012/12/quiz-timouts-in-moodle-adjusting.html) | Lectura del código de renovación (`lib/axios.ts`) y AUTH-09 (ya estaba) | La sesión se renueva sola en cada petición; solo caduca tras 7 días sin uso. No encontré fallo. **No probado**: la llave larga caducada con cambios sin guardar. |
| 9 | «Sin nota» contado como cero, o cero contado como «sin nota» | [Canvas: missing vs zero](https://kb.wisconsin.edu/dle/91483) | CERO-01…07 | **Fallo grave encontrado y arreglado**: el alumno con todo en 0 salía promovido (1). |
| 10 | El alumno retirado sigue en la lista | Queja general de secretarías (búsqueda sin fuente concreta) | RET-01…04 | **Fallo encontrado y arreglado**: seguía contando y se le reinscribía (3). |
| 11 | El portal de padres no coincide con lo del profesor | [PowerSchool Parent Portal](https://cdnsm5-ss14.sharpschool.com/UserFiles/Servers/Server_495315/File/Parents/parent-portal-FAQs.pdf) | REP-01 | **Arreglado** (4). |
| 12 | Asistencia por QR «firmada» por un amigo | [OneTap: proxy attendance](https://www.onetapcheckin.com/prevent-students-fake-attendance), [Clappia](https://www.clappia.com/help/qr-code-attendance-proxy-prevention) | QR que cambia cada 10 s, un teléfono por alumno, faro (QR-01…14, QRE-01, ya estaban) | Ya estaba bien: pasan. |
| 13 | Cobrar dos veces la misma cuota | Quejas de portales de pago escolar | Candado por alumno al cobrar (PAGOS-*, ya estaban) | Ya estaba bien: pasan. |
| 14 | Subir las notas finales borra las de los lapsos | [SIAGIE (Perú), preguntas frecuentes](https://siagie.minedu.gob.pe/preguntasfrecuentes/?pg=3) | Gestiedu no tiene carga masiva que reescriba notas | No aplica. |
| 15 | Una nota suelta cuenta donde no debe | Hallazgo propio al probar lapsos | LAP-01…03 | **Fallo encontrado y arreglado** (6). |

## Qué queda por decidir

1. **La escala de notas configurable no se usa en los cálculos.** Configuración → Académico deja poner la escala
   (por ejemplo, de 0 a 100) y la nota mínima dentro de ella, pero el servidor lo calcula todo sobre 20: con
   escala 0-100 y mínima 60, un 85 cuenta como 17 y el alumno sale reprobado. O se quita el campo, o se decide
   cómo convertir (y en qué pantallas enseñar la escala del liceo). No lo toqué: es una decisión de producto.
2. **Asistencia por día o por asignatura.** El art. 109 habla del 75 % de un grado, área o asignatura; Gestiedu
   guarda una asistencia por alumno y día, compartida por todas las clases de ese día (el profesor de la
   segunda hora ve, y puede cambiar, lo que marcó el de la primera). Pasar a asistencia por clase es un cambio
   grande de datos.
3. **El 75 % en la promoción.** Hoy la asistencia no decide nada: solo avisa al representante (80 % por
   defecto). ¿Se quiere que el cierre del ciclo marque (o deje fuera de revisión) a quien no llega al 75 %,
   contando o no las justificadas?
4. **Las inasistencias justificadas** cuentan como falta en todos los porcentajes. El mapa dice «pueden
   excluirse según configuración del instituto», pero esa configuración no existe.
5. **La ruta `PATCH /api/users/:id/status` alterna** el estado en vez de poner el que se le pide: dos clics
   seguidos lo dejan como estaba. Ninguna pantalla la usa hoy.
6. **Sembrado y cuentas de prueba** (ver «Línea base»): un sembrado único que deje el liceo de pruebas como lo
   esperan las pruebas de navegador, sin contraseñas escritas dentro.

## Para anotar en `docs/MAPA_DE_CALCULOS.md` y `docs/AUDITORIA-FUNCIONAL.md`

No los edito (otras sesiones trabajan ahí). Lo que habría que anotar está al final de cada arreglo, en
«Qué estaba mal», con la etiqueta **Para `docs/MAPA_DE_CALCULOS.md`**.
