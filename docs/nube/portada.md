# La portada con los aparatos que se usan solos

## Para revisar

- **Rama:** `nube/portada` (sale de `8b4219f`; no toca `main`).
- **Commits**, del más viejo al más nuevo:
  - `ffe65ca`: guion `docs/nube/portada/medir-portada.mjs`, que mide FCP, LCP, CLS, bloqueo y peso de la portada en teléfono y escritorio.
  - `f513794`: borrador de este informe con la línea base.
  - `16ac72d`: el escaparate (`components/landing/escaparate/`), con portátil, tableta y teléfono en CSS 3D y la app hecha en HTML, un dedo o un cursor que toca, cinco escenas, pausa y «menos movimiento».
  - `0a66a21`: la portada pasa a ser de servidor, con metadata. Textos nuevos, comprobados en el código: qué resuelve, para quién, cómo se empieza y preguntas.
  - `984ec4c`: se quitan `DeviceShowcase3D.tsx` y `react-parallax-tilt`. Del lock solo salen sus dos entradas.
  - `2fc9c6f`: el escaparate pesa menos en un teléfono lento (se monta por partes y las cifras se animan en CSS). Además, arreglo de hidratación con «menos movimiento» y contraste de las iniciales.
  - `1fb0542`: `tests/e2e/portada.spec.ts` (PORTADA-01…08) y el guion de fotos.
  - Este commit: el informe, las capturas y el GIF.
- **Cómo verlo:**
  ```bash
  cd apps/web && npm run build && npx next start -p 3000   # http://localhost:3000
  npx playwright test tests/e2e/portada.spec.ts              # desde la raíz; la portada no necesita el backend
  node docs/nube/portada/medir-portada.mjs despues           # rendimiento
  ```
  El GIF está en `docs/nube/portada/escaparate.gif` y las capturas, al lado.
- **En qué punto quedó:** la portada está completa y en verde (16/16 de `portada.spec.ts`), con capturas y GIF.
- **Qué falta o hay que decidir** (detalle abajo, en «Qué queda por decidir»):
  1. Un **canal de contacto** para el director que aún no es cliente (correo o WhatsApp). No lo invento: sin él, la única llamada es «Entrar a mi liceo».
  2. Una **imagen para compartir** (Open Graph) y el **dominio** (`metadataBase`), para que el enlace se vea bien en WhatsApp.
  3. Las funciones que un director venezolano pide y el sistema aún no tiene (boletas, resumen final, inscripción en línea). Van como propuestas, no en la portada.

---

## Qué se hizo y por qué

### 1. El escaparate: tres aparatos que se usan solos

Arriba, bajo el titular, hay un portátil, una tableta y un teléfono en perspectiva. El dedo (el cursor, en el portátil) va tocando y la pantalla responde. Hay cinco escenas en bucle, de unos 40 s en total:

| Escena | Aparato que se usa | Lo que pasa |
|---|---|---|
| Asistencia | teléfono | El profesor toca «presente» alumno a alumno. La cuenta sube de 12 a **18 de 32**, la barra crece y sale «Guardado 07:03». Antes toca «Académico» en la barra de abajo. |
| Notas | tableta | Toca la casilla del examen, aparece la nota y **el promedio de la sección se mueve** (14,2 → 14,4). La nota de cada alumno es el promedio ponderado de verdad (25/35/40 %), calculado a partir de los datos, no escrito a mano. |
| Horario en vivo | portátil (y teléfono) | El reloj del liceo pasa de 07:44 a 07:45 y el recuadro de «ahora» **baja a la hora siguiente**. El cursor pulsa «Entrar a la clase». En el teléfono, el dedo toca «Horarios» en la barra de abajo y sale el día en vertical. |
| Asistencia por QR | tableta y teléfono | En la tableta del profesor, el **QR cambia** cada tres pasos (en la app es cada 10 s) mientras **entran los nombres** en «Van entrando». El teléfono de un alumno escanea y le sale «¡Listo! Presente». |
| Cifras del lapso | portátil | Las cifras de `AcademicStats` (promedio, en riesgo, asistencia con su rayita del mínimo, ocupación, observaciones) **crecen con sus barras**. El cursor cambia a «2.º lapso» y todas se mueven a los valores nuevos. |

- **La interfaz es la de verdad.** Levanté la app con el sembrado y saqué capturas con Playwright (panel, académico, horarios, clase en vivo y pase de asistencia, en teléfono y ordenador). Las pantallas copian sus clases: el lienzo gris, las tarjetas blancas con borde, el índigo de lo que se pulsa, el verde de «Presente», la barra lateral blanca, la barra de abajo del teléfono con la casita en el centro, `AcademicStats` con la rayita donde se aprueba y los textos de `PaseDeListaQr` («Cambia cada 10 segundos: una foto no sirve.»). Todo está hecho en HTML, sin imágenes, y ninguna pantalla llama al servidor: cada una es una función del paso del guion (`escaparate/guion.ts`).
- **Datos de mentira, venezolanos y sin personas reales.** Son nombres corrientes inventados (Valentina Rojas, Santiago Pérez…), cédulas V-3x.xxx.xxx inventadas, «Prof. Andrés Salazar», 1er Año A de Matemáticas, turno de la mañana y escala del 1 al 20.
- **Cómo se mueve.** Un solo reloj cuenta medios pasos. En la primera mitad el dedo está sobre lo que toca y nace la onda; en la segunda, ya va hacia lo siguiente. Así el dedo llega antes de tocar, como una mano. El aparato que se usa se adelanta un poco y el escenario gira ±3° hacia él (la opción de «girar despacio»).
- **Técnica:** CSS 3D (`perspective`, `preserve-3d`) y framer-motion con `LazyMotion` + `domAnimation`, el paquete pequeño. **Solo se anima `transform` y `opacity`.** Las barras crecen con `scaleX`, nunca con `width`. Nada de three.js: no hace falta, y serían cientos de KB para un teléfono.
- **Cuándo se para:**
  - fuera de la vista (IntersectionObserver);
  - con la pestaña escondida (`visibilitychange`);
  - con el botón **Pausar**. WCAG 2.2.2 pide poder parar lo que se mueve solo más de 5 s, y eso vale para todos, no solo para quien pidió menos movimiento;
  - con «menos movimiento»: queda una foto fija con las tres pantallas completas, sin dedo, y los botones de las escenas siguen enseñando cada una, quieta.
- **Composición propia en el teléfono** (por debajo de 768 px): el portátil arriba y la tableta y el teléfono delante, más grandes. El escenario se dibuja a un tamaño fijo y se encoge con un solo `transform: scale`. La caja que lo contiene reserva su sitio con `aspect-ratio`, así que la página no salta (CLS 0).
- **Accesible:** los aparatos llevan `aria-hidden`. Debajo va el mensaje en texto de verdad («El profesor pasa asistencia desde su teléfono…»), que cambia con la escena, y una fila de botones (44 px) para saltar a cada escena.

### 2. El resto de la portada, para un director

- **Titular:** «Tu liceo al día, desde el teléfono de cada profesor». Debajo, en dos frases, qué hace. Hay dos llamadas: «Entrar a mi liceo» (el mismo `SchoolAccessModal`, intacto) y «Qué resuelve».
- **Qué resuelve:** ocho tarjetas escritas como problema y solución (notas, asistencia, horarios, mensualidades, representantes, sin señal, cierre de año, que nada se pierda).
- **Hecho para cómo funciona un liceo en Venezuela:** tres lapsos, escala del 1 al 20, mañana/tarde/integral, hasta 6.º, búsqueda por cédula y la hora del liceo.
- **Para quién:** qué ve cada uno de los cuatro roles, y que lo comprueba el servidor.
- **Cómo se empieza:** tres pasos.
- **Preguntas:** seis, con `<details>` nativo, sin JavaScript.
- **La página es de servidor.** Antes era `'use client'` entera, y por eso no podía llevar `metadata`. Ahora el texto llega pintado en el primer byte y lo único de navegador son el escaparate y los botones del portal (`BotonDelPortal.tsx`).
- **SEO:** `title` (el mismo que pone `DynamicTitle` en `/`, para que no parpadee), `description`, Open Graph y Twitter en `es_VE`, y JSON-LD `SoftwareApplication` sin valoraciones ni precios, porque no los hay. Hay una sola `h1` y cada sección tiene su título.
- **Paleta:** la portada deja el azul `blue-600` y pasa al índigo de la app, para que la portada y lo que hay dentro se vean como una sola cosa.
- **Se quitó** `DeviceShowcase3D.tsx` (capturas estáticas con pestañas) y la dependencia `react-parallax-tilt`. Las imágenes de `public/screenshots/` quedan sin usar en la portada. No las borré porque las genera `apps/web/scripts/capture-real-devices.js`: decide tú.

### 3. Lo que la portada ya NO dice, porque el sistema no lo hace

La portada anterior prometía cosas que busqué en el código y no están:

| Decía | La realidad en el código |
|---|---|
| «Tasa BCV… con conversión oficial **automática**» | La tasa la escribe la administración al cobrar (`pagos.service.ts`, `aMonedaBase`): no se descarga del BCV. |
| «Gestión de **pasantías**», «menciones técnicas» | No existe nada de pasantías ni de menciones. Sí existe la modalidad media técnica hasta 6.º (`close-cycle.service.ts`). |
| «**Actas oficiales** de notas» | La exportación a PDF/Excel de notas es un marcador: `grades.routes.ts` `/export/:format` devuelve JSON («exporting can be implemented later»). |
| «**Alertas automáticas** por porcentaje de inasistencias» | Lo que hay es un aviso en el panel del representante cuando baja de la asistencia mínima (`dashboard.service.ts`), no alertas que se envíen. |
| «Promoción **automática**» | El sistema **propone** quién pasa, quién pasa con pendientes y quién repite, y la dirección lo confirma (`SuggestionStatus`). |
| Horarios fijos «7:00 AM – 12:45 PM» | Las horas son configurables por liceo y por turno. |

### Qué dice la portada y dónde está en el código

| Frase | Dónde |
|---|---|
| Escala del 1 al 20, aprueba con 10, configurable | `DEFAULT_ACADEMIC_CONFIG` (`close-cycle.service.ts`), `AcademicStats` |
| Tres formas de asistencia; QR que cambia cada 10 s; un teléfono no marca a dos | `PaseDeListaQr.tsx`, `asistencia-qr.service.ts`, CLAUDE.md «Asistencia por QR» |
| No deja a un profesor en dos sitios a la vez | `schedule-conflicts.service.ts` |
| Reemplazo de una clase suspendida si el profesor está libre | `class-replacements.service.ts` |
| Cuotas mensuales, quincenales o por lapso e inscripción, en USD/VES, anular con motivo, módulo apagado | `MAPA_DE_CALCULOS.md` §8b, `pagos.service.ts` |
| El representante ve promedio, asistencia y horario, con aviso | `MisRepresentados.tsx`, `dashboard.service.ts` (`/dashboard/tutor`) |
| Sin señal se ve lo último; guardar lo dice en el acto; se instala como app | CLAUDE.md «Sin señal se mira, no se toca», `sw.js`, manifest, `apps/movil` |
| Propone la promoción según reglas del liceo; hasta 6.º en media técnica | `close-cycle.service.ts` |
| Una base por liceo, copia cada noche, papelera con la cascada | CLAUDE.md «Borrar» y «Respaldos», `utils/papelera.ts` |
| Cada rol ve lo suyo, lo comprueba el servidor | `authorization.service.ts` |
| La hora la pone el servidor | `utils/school-time.ts` |

---

## Mediciones: antes y después

`node docs/nube/portada/medir-portada.mjs` sobre `next start` da la mediana de 3 cargas:

- **Teléfono:** 390×844, CPU 4 veces más lenta y red 4G lenta.
- **Escritorio:** 1366×900, sin freno.

| | FCP | LCP | CLS | Bloqueo (TBT) | JS | Imágenes | Total |
|---|---|---|---|---|---|---|---|
| **Antes**, teléfono | 1136 ms | 1136 ms | 0,000 | 222 ms | 267 KB | 31 KB | 382 KB |
| **Después**, teléfono | 1104 ms | 1104 ms | 0,000 | 303 ms | 295 KB | 0 KB | 387 KB |
| **Antes**, escritorio | 140 ms | 140 ms | 0,000 | 0 ms | 275 KB | 120 KB | 485 KB |
| **Después**, escritorio | 136 ms | 136 ms | 0,000 | 0 ms | 295 KB | 0 KB | 398 KB |

Cómo leerlo:

- **CLS sigue en 0**, y el LCP (el titular) no empeora.
- **En escritorio la página pesa 87 KB menos**, porque ya no baja capturas PNG.
- **El JS sube 28 KB** comprimidos: es framer-motion (`LazyMotion`/`domAnimation`).
- **El bloqueo en un teléfono lento sube unos 80 ms.** La primera versión del escaparate llegó a 534 ms. Se bajó así, y cada paso se midió:
  1. Montar los aparatos cuando el navegador queda libre, y de uno en uno: 534 → 378 ms.
  2. Que cada medio paso repinte solo el dedo y no las tres pantallas.
  3. Animar las cifras y las barras en CSS, no con un componente de framer por cada una: → 303 ms.
- **De dónde sale el resto.** Compilé una vez la portada **sin** el escaparate para saber qué es de quién. Las tareas largas de antes de 2,2 s (una de ~170 ms incluida) salen igual sin él: son la hidratación de los proveedores globales del `layout`. Lo que añade el escaparate son tres o cuatro tareas de 50–140 ms al montar, ya fuera del primer pintado.

Qué **no** mide: un teléfono de verdad, la red de un liceo, ni el arranque en frío del servidor.

---

## Qué se probó

- **`tests/e2e/portada.spec.ts`: 16/16 en verde.**
  - PORTADA-01: sin errores de consola (ver la nota de abajo).
  - PORTADA-02/03: sin salirse de ancho ni arrastrar de lado a 360, 390, 844×390 (tumbado), 768, 1366 y 1920 px. En el teléfono de pie, además, dedo ≥ 44 px y letra ≥ 12 px. Usa `scripts/reglas-del-telefono.mjs`.
  - PORTADA-04: se mueve sola, «Pausar» la para y se puede saltar a una escena. PORTADA-04b: fuera de la vista se para.
  - PORTADA-05: con «menos movimiento», dos fotos del escaparate con 3 s de diferencia son idénticas píxel a píxel, y no hay animaciones en marcha.
  - PORTADA-06: «Entrar a mi liceo» abre el portal y, con `instituto-testing`, lleva a su login.
  - PORTADA-07: contraste axe (WCAG AA) en claro y oscuro, en teléfono y escritorio, con las preguntas abiertas.
  - PORTADA-08: el escaparate lleva `aria-hidden`; hay una sola `h1`; pasan las reglas de axe `aria-hidden-focus`, `button-name`, `link-name`, `heading-order`, `landmark-one-main`, `document-title` y `html-has-lang`.
- `apps/web`: `tsc` limpio y `jest` 48/48, igual que al empezar.
- Capturas en los seis tamaños y un ciclo entero fotografiado cada 3,5 s para ver cada escena (el GIF sale de ahí).

**Dos fallos reales que salieron al medir y se arreglaron:**

- Con «menos movimiento», el primer pintado del navegador no coincidía con el del servidor (error 418 de React). Ahora se lee con `matchMedia` + `useSyncExternalStore`, que dice «no» al hidratar.
- Con «menos movimiento», el escenario terminaba su giro de 1,8 s. Ahora va al sitio de golpe.

**Nota sobre la consola.** Quien llega a `/` sin sesión provoca dos `401` de `/api/auth/refresh`. No es de la portada: lo hace `TiempoRealProvider`, que vive en el `layout` de todas las páginas e intenta abrir el tiempo real sin sesión. PORTADA-01 ignora ese caso y solo ese. La propuesta es que no lo intente sin sesión; toca un archivo fuera del área de esta tarea.

**Aparte: dos cosas de Playwright que costaron tandas enteras.**

- `test.use({ reducedMotion: 'reduce' })` a secas **no llega al navegador** en esta versión: `matchMedia` seguía diciendo `false`. Hay que pasarlo por `contextOptions`.
- Una prueba que compare el `innerHTML` para ver «si se mueve» falla por estilos que framer reescribe sin mover nada. Hay que comparar píxeles.

## Qué NO se probó

- **La tanda completa de Playwright (198 pruebas) y `npm run movil -- --exigir`.** No toqué ninguna pantalla de dentro de la app, pero no las corrí enteras.
- **El backend** no se tocó. Su línea base en esta máquina es 859/867. Los 8 fallos (`tenant-mismatch.test.ts`, `logo-en-la-base.test.ts`) son del entorno: las bases que crean esas pruebas no tienen la extensión `pg_trgm`.
- **Un teléfono de verdad.** Todo es Chromium emulando.
- **Safari/iOS.** El 3D con `preserve-3d` se comporta distinto ahí, y no hay cómo probarlo en esta máquina.
- **Lighthouse completo.** Se usó el guion propio, que mide lo mismo que importa: LCP, CLS y bloqueo.

## Qué queda por decidir

1. **Contacto para quien aún no es cliente.** El sistema no tiene registro abierto: el liceo lo da de alta el superadmin. Hace falta un correo o un WhatsApp de ventas para una llamada «Pide una demostración». Es la conversión que más falta.
2. **Imagen para compartir (Open Graph) y dominio.** Sin `metadataBase` y sin imagen, el enlace en WhatsApp sale sin foto. Se haría con `app/opengraph-image.tsx`, fuera del área de esta tarea.
3. **`public/screenshots/`** (1,1 MB) ya no la usa la portada. ¿Borrarla junto con `scripts/capture-real-devices.js`?
4. **El enlace «Acceso de la plataforma»** (superadmin) quedó solo en el pie. ¿Quitarlo de la portada pública?
5. **Móvil largo.** En 390 px la página mide ~9.300 px, sobre todo por las ocho tarjetas de «Qué resuelve». Se podría plegar a cuatro con «ver más».

### Propuestas para el sistema (lo que un director pide y aún no hay)

- **Boletas y resumen final de evaluación** con el formato que entrega el liceo al cierre, en PDF. Hoy la exportación es un marcador (`grades.routes.ts`). Es lo primero que pregunta un director: el boletín por lapso es como se comunica la evaluación (Reglamento de la LOE; ver fuentes).
- **Inscripción en línea**, con la solvencia como requisito. En los colegios privados la morosidad baja porque «para inscribirse hay que estar solvente» (Efecto Cocuyo), así que conectar la inscripción con Pagos es valor directo.
- **La tasa del BCV del día**, propuesta al cobrar (hoy se escribe a mano). La norma pide cobrar en bolívares a la tasa oficial del BCV (El Pitazo, GHM).
- **Avisos al representante** (correo o notificación) cuando baja la asistencia o una nota. Hoy solo lo ve si entra.

---

## La investigación

### El director de un liceo venezolano

- **Dinero y morosidad (privados y subsidiados AVEC).** Las cuotas van ancladas al dólar y se cobran en bolívares a la tasa del BCV. Los ajustes de 20–40 % hacen temer más morosidad, que llegó al 40 % en algunos casos. Por eso la portada habla de cuotas en USD/VES, de «quién debe» y de que un pago no se borra.
- **Conexión y luz.** El 85 % de los planteles públicos no tiene internet y un 64–69 % tiene fallas eléctricas agudas. Por eso la tarjeta «Aunque se vaya la señal» y la pregunta «¿Qué pasa si se va el internet o la luz?», contestada con honradez: consultar sí, guardar no.
- **Falta de docentes** (se habla de 200–300 mil). Lo que ahorra tiempo al profesor pesa más: por eso el titular habla del teléfono del profesor y de pasar lista en segundos.
- **Evaluación.** Tres lapsos (cortes en diciembre, abril y julio), escala del 1 al 20 en media y boletín informativo. Por eso la sección «Hecho para cómo funciona un liceo en Venezuela», con las reglas como valor de fábrica que el liceo cambia.

### Portadas de SaaS que convierten

- Un titular corto (menos de 8 palabras) y una sola llamada principal en el hero. Se aplicó: una llamada llena («Entrar a mi liceo») y una secundaria de ancla.
- Hay que cambiar las capturas estáticas por una microanimación en bucle que enseñe un flujo real en 3–5 s. Es justo el escaparate: cada escena es un flujo de pocos segundos.

### Movimiento, rendimiento y accesibilidad

- Animar solo `transform`/`opacity` (se componen en otro hilo y no cuentan para CLS): Chrome for Developers y web.dev.
- Pausar fuera de la vista con `useInView`/IntersectionObserver: Motion y Framer.
- `prefers-reduced-motion` cubre WCAG 2.3.3, pero **2.2.2 (Pausar, detener, ocultar) pide un control para todos** si algo se mueve solo más de 5 s. De ahí el botón «Pausar».

### Fuentes

- [Efecto Cocuyo — Mensualidades en dólares se ajustarán a tasa del BCV](https://efectococuyo.com/la-humanidad/mensualidades-dolares-colegios-privados-tasa-bcv/)
- [Efecto Cocuyo — Ajustes entre 20 y 40 % preocupan a representantes](https://efectococuyo.com/economia/ajustes-entre-20-y-40-preocupan-a-representantes-que-temen-por-mas-morosidad-o-desercion-en-colegios-privados/)
- [El Diario — Colegios privados: aumentos, tarifas congeladas (2026)](https://eldiario.com/2026/08/10/colegios-privados-caracas-tarifas-ano-escolar/)
- [Crónica Uno — Colegios privados recortan gastos ante morosidad](https://cronica.uno/colegios-privados-enfrentan-el-nuevo-ano-escolar-con-danos-por-sismos-morosidad-y-cuotas-congeladas/)
- [El Pitazo — Pueden cobrar en dólares pero a tasa del BCV](https://elpitazo.net/economia/colegios-privados-pueden-cobrar-mensualidades-en-dolares-pero-a-tasa-del-bcv/)
- [Efecto Cocuyo — Aulas en ruinas, maestros sin casa](https://efectococuyo.com/la-humanidad/aulas-en-ruinas-maestros-sin-casa-el-sistema-educativo-en-supervivencia/)
- [TalCual — Año escolar 2025-2026: un balance oficial a medias](https://talcualdigital.com/ano-escolar-2025-2026-un-balance-oficial-a-medias-que-no-suelta-todas-las-cifras/)
- [Reglamento General de la Ley Orgánica de Educación](https://docs.venezuela.justia.com/federales/reglamentos/reglamento-general-de-la-ley-organica-de-educacion.pdf)
- [SciELO — La evaluación en el sistema educativo bolivariano](https://ve.scielo.org/scielo.php?script=sci_arttext&pid=S1316-49102008000100024)
- [SaaSFrame — 10 SaaS landing page trends for 2026](https://www.saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples)
- [Alf Design Group — SaaS hero section best practices](https://www.alfdesigngroup.com/post/saas-hero-section-best-practices)
- [Chrome for Developers — Avoid non-composited animations](https://developer.chrome.com/docs/lighthouse/performance/non-composited-animations)
- [web.dev — CSS for Web Vitals](https://web.dev/articles/css-web-vitals)
- [Motion — useInView](https://www.framer.com/motion/use-in-view/)
- [CSS-Tricks — Accessible web animation: the WCAG on animation explained](https://css-tricks.com/accessible-web-animation-the-wcag-on-animation-explained/)
- [W3C WCAG issue #3766 — 2.2.2 y prefers-reduced-motion](https://github.com/w3c/wcag/issues/3766)

---

## Arreglos del ENTORNO (no del producto)

Son para quien repita esto en otra máquina:

- La máquina no tiene IPv6 y el backend escucha en `::`. Se arrancó con un `--require` que cambia `::` por `0.0.0.0`, fuera del repositorio.
- Playwright 1.62 busca `chromium_headless_shell-1234` y aquí hay la 1194: enlaces simbólicos en `/opt/pw-browsers`.
- Faltaba `@testing-library/dom` y sin ella `next build` no pasa el typecheck: `npm i --no-save`, sin tocar el lock.
- `apps/backend/.env` y `.env.test` se crearon a mano; están en `.gitignore` y no se suben.
