# Plan: que la app se use bien en un teléfono

Escrito el 21/09/2026, a partir de ocho capturas de la APK en un Android real.
No es una lista de gustos: cada punto trae la prueba en el código de por qué
pasa. Se cierra cuando la medición de la Fase 0 sale limpia para los cuatro
roles.

---

## CERRADO — 22/09/2026

`npm run movil`: **31 pantallas, 31 limpias**, para Administrador, Profesor,
Estudiante y Representante. Se entró midiendo 31 con el reloj tapando la
cabecera, 27 con botones demasiado pequeños, 23 que se arrastraban de lado y
16 con letra por debajo de 12 px.

| Fase | Estado |
|---|---|
| 0 · Medir de verdad | Hecha — `scripts/reglas-del-telefono.mjs`, `npm run movil`, `tests/e2e/movil.spec.ts` |
| 1 · El marco | Hecha — zona segura, cabecera con la foto, «Mi cuenta», barra con Inicio en el centro, fuera la cortina |
| 2 · El panel | Hecha — sin saludo, 2 × 2, accesos, fuera las tarjetas de «Próximamente» |
| 3 · Listas | Hecha — siete tablas a `TablaAdaptable`, con orden en el teléfono |
| 4 · Las dos densas | Hecha — horario por días, plan por bloques, botón de girar |
| 5 · Entrar + huella | Hecha — pantalla rediseñada y llave de teléfono (`LLAVE-01…07`) |
| 6 · Repaso | Hecha — 804 de servidor, 203 de navegador, 41 de web, typechecks y compilación |

**Añadido sobre la marcha, a petición:** lo que se descargó se guarda en el
teléfono y sin señal se ve (`lib/lo-guardado-en-el-telefono.ts`,
`SIN-01…03`); guardar sigue necesitando internet.

**Lo que se encontró por el camino y no estaba en el plan:**

- `/api/auth/logout` **no llamaba al servidor**: solo borraba las cookies del
  navegador, así que la sesión seguía viva por dentro hasta quince minutos.
- `/login` sin liceo responde «no existe», y ahí es donde mandaba a quien se le
  caducaba la sesión.
- El panel pedía los números del liceo entero **también para el profesor**, y
  el servidor respondía 403.
- En el plan de evaluación, **desde un teléfono no se podían unir semanas** (el
  botón aparecía al pasar el cursor) y **al guardar se perdía qué columna
  estaba unida**.

---

## 0. Por qué no lo vi yo antes

`npm run fotos` recorrió 19 pantallas a 390 × 844 y dijo *«ninguna se sale de
ancho»*. En el teléfono, al mismo tiempo, había ocho problemas a la vista.

No mentía: **medía lo que no era.** Su única comprobación es
`document.documentElement.scrollWidth > innerWidth`, y de los ocho fallos
fotografiados, ese número no detecta ni uno:

| Lo que se ve en el teléfono | Por qué el número no lo ve |
|---|---|
| La barra de estado tapa la cabecera | Es alto, no ancho |
| La tabla de alumnos hay que arrastrarla | Está dentro de un `overflow-x-auto`: el documento no crece |
| Cuatro tarjetas ocupan la pantalla entera | Es densidad, no desbordamiento |
| Para salir hay que girar el teléfono | Eso no es una medida, es un recorrido |
| El plan de evaluación se escribe a ciegas | Tampoco |

La primera tarea del plan es cambiar el medidor. Un medidor que da verde
mientras el usuario fotografía ocho fallos es peor que no tener ninguno.

---

## 1. Lo que está roto, y dónde

### 1.1 La barra de estado se come la cabecera — **toda la app**

```
grep -rn "safe-area-inset-top" apps/web/src   →  0 resultados
```

`apps/movil/android/variables.gradle` fija `targetSdkVersion = 35`. Desde
Android 15, con ese objetivo el sistema **obliga** a dibujar de borde a borde:
la ventana de la app empieza detrás del reloj y la batería. La web tiene
`viewport-fit=cover` (`app/layout.tsx:66`), así que `env(safe-area-inset-top)`
ya vale lo que tiene que valer — pero **no se usa en ningún sitio**. La de
abajo sí (`BarraInferiorMovil`, `DashboardShell`); la de arriba se olvidó.

Se ve en la 1.ª, 2.ª, 3.ª y 8.ª foto. Afecta a todas las pantallas, no a esas.

### 1.2 El panel de inicio

`app/(dashboard)/dashboard/page.tsx`

- L177-184: `¡Hola, {nombre}! 👋` y `Bienvenido al panel de control de…`.
- L186-195: la fecha sale de `new Date()`, y la regla de este repositorio dice
  que la hora la pone el servidor (`useSchoolToday()`), nunca el dispositivo.
  Un teléfono con la fecha cambiada enseña otra fecha.
- L199-206: cuatro `DataCard` en una columna. Cada una: `p-6`, icono en un
  cuadro de `p-3`, cifra a `text-3xl`, y separación `gap-6`. Son ~150 px por
  tarjeta, ~670 px de las 844 que tiene la pantalla. Cuatro números ocupan el
  teléfono entero.
- L296-327: dos tarjetas **falsas** que siguen ahí — «Horario de Hoy ·
  Calendario interactivo · Próximamente» y «Avisos Recientes · No hay avisos».
  El administrador baja media pantalla para leer que algo está por venir.

### 1.3 La barra de abajo

`components/layout/BarraInferiorMovil.tsx`

- El botón del centro es «Menú» con un icono de rejilla; abre la cortina
  lateral. El usuario lo quiere como **Inicio, con una casita**.
- Los destinos son `filteredNavItems.slice(0, 4)` (`DashboardShell.tsx:246`):
  al administrador le tocan Inicio, Académico, Materias, Horarios. Con el
  centro son cinco cosas en una barra de 390 px.
- No se esconde al bajar, así que se come 60 px permanentes.
- Se descoloca cuando la pantalla se desborda de ancho (4.ª foto): una barra
  `fixed inset-x-0` se mide contra el ancho del documento, y si el documento
  es más ancho que el teléfono, la barra también.

### 1.4 La cortina lateral es la única salida

`DashboardShell.tsx:209-224`. «Cerrar Sesión» vive solo dentro del menú
lateral. En el teléfono eso sobra: lo que hay en la cortina tiene que estar en
el panel de inicio y en la ficha de la cuenta.

### 1.5 Las tablas se arrastran

Ya existe la solución, escrita y documentada: `components/ui/tabla-adaptable.tsx`
— en pantalla ancha una tabla, en el teléfono **una tarjeta por fila con todos
los datos y su etiqueta**. Su cabecera explica exactamente este fallo.

```
grep -rn "TablaAdaptable" apps/web/src   →  solo /diseno (el muestrario)
```

**Ninguna pantalla real la usa.** Hay 16 archivos con `<table>`; diez son
pantallas de trabajo. La de la 5.ª foto
(`academico/[cycleId]/[sectionId]/page.tsx:496`) son siete columnas con
`whitespace-nowrap` dentro de un `overflow-x-auto`. Ordenar ya funciona
(`handleSort` por nombre, cédula, riesgo, promedio, asistencia,
observaciones): lo que falta es enseñarlo sin arrastrar.

### 1.6 Horario y plan de evaluación: demasiada información para 390 px

| Archivo | Ancho mínimo |
|---|---|
| `schedule/ClassroomScheduleEditor.tsx:374` | `min-w-[700px]` |
| `schedule/TeacherScheduleEditor.tsx:744` | `min-w-[700px]` |
| `academic/evaluation-plan/EvaluationPlanBuilder.tsx:159` | `min-w-[1000px]` |
| `evaluation/EvaluationPlanSection.tsx` | 10 columnas × 18-24 semanas |

El plan son diez columnas (`evaluation/planColumns.ts`) por cada semana del
lapso. En un teléfono eso no es una tabla estrecha: es otra pantalla.

### 1.7 La pantalla de entrar

`app/(auth)/login/page.tsx`

- `min-h-screen … py-12` (L254): `100vh` en un móvil no es lo que se ve, y sin
  `env(safe-area-inset-*)` el contenido se mete debajo del reloj.
- La tarjeta solo se redondea en `sm:` (L321): en el teléfono es una banda
  blanca de borde a borde, cuadrada. Es lo que se ve en la 1.ª foto.
- Sin ojo para ver la contraseña, sin «olvidé mi contraseña», sin huella.

---

## 2. El plan

### Fase 0 — Medir de verdad (primero, y no se salta)

Reescribir `scripts/fotos-del-telefono.mjs` como auditoría, no como álbum. Por
cada pantalla y cada rol:

1. La pantalla se sale de ancho (lo de ahora).
2. **Algún trozo de dentro se arrastra**: cualquier elemento con
   `scrollWidth > clientWidth + 1`. Esto es lo que se escapaba.
3. **Algo pintado debajo de las zonas del sistema**: texto o botones en los
   primeros `safe-area-inset-top` px o en los últimos `inset-bottom` + 64.
4. **Botones más pequeños que un dedo**: `< 44 px` de alto o de ancho.
5. **Letra por debajo de 12 px.**
6. **Cuánto hay que bajar** hasta el primer dato útil.

Recorrido completo, no las 19 de ahora: incluir sección, materia, clase en
vivo, plan de evaluación, horarios de sección y de profesor, pagos, ficha de
usuario, calendario y eventos, para Administrador, Profesor, Estudiante y
Representante.

La hoja de contactos marca en rojo cada incumplimiento con su motivo. Y una
prueba de navegador, `tests/e2e/movil.spec.ts`, que **falla** cuando alguna de
las seis reglas se rompe: así no vuelve a entrar por la puerta de atrás.

### Fase 1 — El marco: que la app deje de estar rota

1. **Zona segura arriba, en toda la app.** Utilidades `pt-safe` / `pb-safe` en
   `tailwind.config.js` (y su registro en `lib/utils.ts`, como manda la regla
   de contraste), aplicadas a la cabecera del teléfono, a los diálogos, a las
   cortinas y a todo lo `fixed`/`sticky` de arriba. En la APK, además,
   `StatusBar.setOverlaysWebView({ overlay: false })` y el color del liceo
   detrás del reloj.
2. **Cabecera nueva del teléfono:** la foto del perfil y, al lado, **solo el
   nombre**. Nada más.
3. **Ficha «Mi cuenta»** (se abre tocando la foto): nombre, rol, liceo;
   *Configuración del liceo* si es administrador; *Cambiar contraseña*
   (`POST /auth/change-password`, ya existe en el servidor), *Sesiones activas*
   (`GET /auth/sessions`, también) y **Cerrar sesión**.
4. **Barra de abajo nueva:** **Inicio en el centro, con casita**, y un destino
   a cada lado según el rol. Se esconde al bajar y vuelve al subir.
5. **Fuera la cortina lateral en el teléfono.** Sigue en pantalla grande.
6. **Cero desbordamiento de ancho** en todas las pantallas (las barras de
   herramientas que no se parten).

### Fase 2 — El panel de inicio

1. Fuera «¡Hola, X!» y «Bienvenido». La cabecera es la fecha **del servidor**.
2. Los cuatro números en una rejilla de **2 × 2 compacta**: ~190 px en total en
   vez de ~670. La tarjeta grande se queda para pantalla ancha.
3. Debajo, **los accesos** a lo que estaba en la cortina —Académico, Materias,
   Horarios, Eventos, Pagos, Usuarios, Calendario, Configuración—, filtrados
   por rol. Esto es lo que sustituye a la barra lateral.
4. Fuera las dos tarjetas de «Próximamente» y de avisos vacíos. Lo que no tiene
   dato no ocupa pantalla.

### Fase 3 — Listas y tablas

1. Añadir **orden** a `TablaAdaptable`: columnas ordenables en la tabla y, en
   el teléfono, una fila de fichas «Ordenar por: Nombre · Cédula · Promedio».
2. Migrar las diez tablas de trabajo. La de alumnos queda: foto y nombre
   arriba, **la cédula debajo del nombre**, y riesgo, promedio, asistencia y
   observaciones como etiquetas pequeñas. Se toca y se abre el alumno.
3. Buscador y orden pegados arriba; ni una barra horizontal.

### Fase 4 — Las dos pantallas densas

1. **Horizontal a propósito.** `@capacitor/screen-orientation`: un botón
   *«Ver en horizontal»* en horario y en plan de evaluación que gira y fija la
   pantalla, y la devuelve al salir. En el navegador, la API de orientación
   cuando se puede y un aviso cuando no.
2. **Horario en vertical: por día.** Fichas de día (L M M J V) y, debajo, las
   horas de ese día en vertical. Cinco días de ~110 px no caben en 390; un día
   sí, y sobra sitio. La rejilla completa, en horizontal.
3. **Plan de evaluación:** ver la sección 3.

### Fase 5 — Entrar

1. **Rediseño:** alto real (`100dvh`) con zonas seguras, logo y nombre del
   liceo arriba, tarjeta con aire y esquinas redondeadas también en el
   teléfono, campos de 48 px con `autoComplete` e `inputMode`, ojo para ver la
   contraseña, error encima del botón.
2. **Huella (solo en la APK).**
   - La **primera** entrada en un teléfono es siempre correo y contraseña. La
     huella no es otra forma de entrar: es otra forma de **volver** a entrar.
   - Después de entrar, se ofrece guardar la sesión de ese teléfono. Si se
     acepta, la llave de volver a entrar se guarda en el **almacén de claves
     del propio Android** (respaldado por hardware), no en la web ni en el
     almacenamiento del navegador.
   - La huella solo **abre ese almacén**. El servidor no cambia ni una regla:
     sigue rotando la llave en cada uso y sigue pudiendo anularla.
   - Al cerrar sesión, o al apagar la opción, la llave se borra del teléfono.
   - En la PWA no se puede sin llaves de acceso (passkeys/WebAuthn). Queda
     anotado, no entra ahora.

### Fase 6 — Repaso

Fase 0 otra vez para los cuatro roles; 797 de servidor, las de navegador, las
de web, los dos `typecheck` y la compilación; y las reglas nuevas del teléfono
escritas en `CLAUDE.md`, que es donde no se pierden.

---

## 3. El plan de evaluación en un teléfono

### Lo que el plan es de verdad

Antes de dibujar nada hay que mirar cómo está hecho
(`components/evaluation/EvaluationPlanSection.tsx`), porque tiene dos cosas que
una tabla estrecha no sabe contar:

1. **Las columnas las pone el profesor.** Se añaden, se borran y **se les
   cambia el nombre** (`addColumn`, `removeColumn`, `renameColumn`), y la lista
   se guarda con el plan (`metadata.customColumns`). Las diez de
   `planColumns.ts` son el punto de partida del MPPE, no una ley.
2. **Una celda abarca varias semanas.** `colSpan[columna]` dice cuántas semanas
   se come ese trozo, y es **por columna**: «El agua en mi comunidad» puede
   cubrir las semanas 1 a 4 mientras la actividad cambia cada semana.

O sea: el plan no es una rejilla de semanas por campos. Es **una sucesión de
bloques de trabajo en el tiempo**, cada uno con sus campos, y dentro de cada
bloque las semanas con lo suyo. La rejilla es solo cómo se imprime en papel.

Y de ahí salen dos fallos que hay que arreglar igual, se cambie o no el diseño:

- **En un teléfono no se pueden unir celdas.** El botón `↓` que las expande
  vive en `ExpandHandle`, con `opacity-0 group-hover:opacity-100`
  (L152). En una pantalla táctil **no hay puntero que se pose**: el botón no
  existe. Y el texto de ayuda de la propia pantalla dice «pasa el cursor sobre
  la celda» (L942).
- **Al guardar se pierde qué columna estaba unida.** `weekRowsToDbRows` guarda
  un solo `endWeekNumber` por fila —el mayor de todas las columnas— y
  `dbRowsToWeekRows` lo devuelve **solo a las columnas marcadas `mergeable`**
  (tema generador y tejido temático). Si el profesor une «Actividad» a lo largo
  de tres semanas, al recargar la unión ha saltado a otra columna. En una
  columna suya, añadida por él, se pierde entera.

### La propuesta: el plan como bloques, no como rejilla

Solo en el teléfono y en vertical. En pantalla ancha, en horizontal y en el
Word que se entrega, **la tabla se queda exactamente como está**.

```
┌──────────────────────────────────┐
│ PLAN · 1er momento · 18 semanas  │
│ Puntos 16 / 20  ·  faltan 4   ▸  │   ← siempre a la vista
├──────────────────────────────────┤
│ ┃ S.1 – S.4 · 19 ago – 13 sep    │   ← el bloque, y lo que abarca
│ ┃ El agua en mi comunidad        │     (tema generador)
│ ┃ Tejido temático: ciclo del agua│     (campos del bloque)
│ ┃            − 1 sem   + 1 sem   │   ← unir/separar, con el dedo
│ ┃ ───────────────────────────────│
│ ┃  S.1  Diagnóstico          —   │   ← las semanas de dentro,
│ ┃  S.2  Maqueta por equipos 4pt  │     con lo que cambia cada una
│ ┃  S.3  —                    —   │
│ ┃  S.4  Exposición          4pt  │
├──────────────────────────────────┤
│   S.5 – S.8 · sin actividad   +  │   ← lo vacío no gasta pantalla
├──────────────────────────────────┤
│ ┃ S.9 – S.10 · 21 oct – 3 nov    │
│ ┃ …                              │
└──────────────────────────────────┘
```

- **Solo se baja con el dedo.** Ni una barra horizontal, en ninguna parte.
- **Lo que abarca un bloque se ve y se toca**: es la cabecera de la tarjeta y
  dos botones de 44 px, no un `↓` que aparece al pasar el cursor.
- **El formulario se construye con las columnas que haya en ese plan**, con el
  nombre que el profesor les haya puesto. Si añade «Recursos», aparece
  «Recursos» en la ficha de cada semana. No hay una lista de campos escrita a
  mano en la pantalla del teléfono.
- **Cada campo dice si es del bloque o de la semana.** Eso es lo que hoy
  significa `mergeable`, pero decidido por el profesor y guardado con su
  columna, en vez de fijo en el código.
- **Las semanas vacías se juntan en una línea.** Un lapso de 18 semanas recién
  empezado son tres o cuatro tarjetas, no dieciocho pantallas.
- **La cuenta de puntos, siempre arriba.** Hoy el total está al final de una
  tabla que hay que arrastrar: se escribe el plan sin saber cuánto se lleva
  repartido.
- **«Campos del plan»**, una pantalla aparte: añadir, renombrar, ordenar y
  borrar columnas, y marcar cuáles abarcan varias semanas. Lo mismo que hoy se
  hace con los ➕ y ✕ de la cabecera de la tabla, pero alcanzable con un dedo.

Y **rellenar por columna** como segundo modo, para llenar de cero: se elige un
campo —*Tema generador*— y se escribe para todas las semanas seguidas, en
vertical; luego el siguiente. Es como se llena un plan de verdad, y es lo que
ya supone el botón «Distribuir equitativamente».

### Lo que hay que arreglar por debajo para que esto se sostenga

1. Guardar **la unión por columna**, no una por fila
   (`endWeekNumber` → un mapa columna → semanas, o una fila por bloque).
2. Que la unión funcione **sin pasar el cursor**: botones de verdad, en la
   tabla del ordenador también.

## 4. Orden y tamaño

| Fase | Qué se gana | Tamaño |
|---|---|---|
| 0 | Saber qué está mal de verdad, y que no vuelva | ½ día |
| 1 | La app deja de estar rota: se ve, se sale, se navega | 1-2 días |
| 2 | El panel de inicio se usa en vez de sufrirse | 1 día |
| 3 | Las listas dejan de arrastrarse | 1-2 días |
| 4 | Horario y plan, usables | 2-3 días |
| 5 | Entrar bien, y con huella | 1-2 días |
| 6 | Que quede medido | ½ día |

Las fases 2 a 5 son independientes entre sí; la 1 va antes que todas y la 0
antes que la 1.
