# Encargo para Antigravity — octubre 2026

**Descarga de la primera vez a la velocidad del internet, el aviso «sin conexión» que parpadea, y el Inicio y las pantallas de cada rol.**

Escrito por Claude el 2026-10-06 y aprobado por Cristian (el dueño). **Tú programas; Claude revisa cada fase antes de pasar a la siguiente.**

Lee primero, enteros, `CLAUDE.md` (raíz) y `apps/web/AGENTS.md`. **Next 16 no es el que conoces**: la documentación está en `node_modules/next/dist/docs/`.

---

## 0. Cómo se trabaja

1. **Una fase cada vez, en este orden: A → B → C → D → E.** Al acabar una fase:
   - escribe `docs/antigravity/INFORME-FASE-<letra>.md` con lo que cambiaste (archivos), los comandos que corriste **con su salida real** (las últimas líneas: «Tests: N passed») y los números medidos;
   - **para y espera la revisión.** No empieces la siguiente fase.
2. **Nada se da por hecho sin evidencia.** La auditoría §64 lo cuenta: un informe anterior decía «100 % en verde» y fallaban 10 pruebas. Si algo falla o no lo pudiste probar, dilo tal cual.
3. **Rama `trabajo/integracion-nube`.** No hagas commit ni push: lo hace Claude después de revisar.
   - Nunca toques ni subas: `.env*`, `apps/movil/android/**` (salvo lo que pida una fase), `key.properties`, keystores, `google-services.json`, `capacitor.config.json`, `version-de-la-app.json`, `*/backend-config.json`, `apps/web/next-env.d.ts`, `assets/cascara`.
   - Nunca pegues contraseñas, tokens ni llaves en archivos ni en informes.
4. **Todo en español:** los nombres nuevos, los comentarios y los mensajes de la pantalla, como el resto del código. Los comentarios explican el **porqué**, con el estilo de los que ya hay.
5. **El túnel** (`npm run tunel`, puerto 3100) es el enlace de pruebas de Cristian: no lo apagues. Para probar, usa `npm run dev` en `apps/backend` (3001) y en `apps/web` (3000). **Nunca arranques un servidor con una tubería** (`| head`): muere por SIGPIPE.
6. **Pruebas:**
   - servidor: `cd apps/backend && npx jest` con Redis de pruebas (`redis-server --port 6391` y `REDIS_PRUEBAS_URL=redis://127.0.0.1:6391`);
   - `npm run typecheck` en el backend;
   - web: `cd apps/web && npx tsc --noEmit && npx jest`;
   - navegador: `npx playwright test <archivo>` con los dos servidores arriba.
   - No edites archivos mientras corre una tanda de pruebas.

## 1. Reglas de rendimiento (Cristian: «siempre optimizado, nada de N+1»)

Lo usarán muchos liceos y muchas personas a la vez. **Cada consulta de más se multiplica por miles.** Claude revisará esto en cada fase:

- **Nunca una consulta dentro de un bucle** por alumno, materia, sección o lapso.
  - Todo en bloque: `groupBy`, `findMany({ where: { id: { in } } })`, `bulkSubjectAveragesConDatos` (`services/bulk-averages.service.ts`), `promediosDeLaSeccion`.
  - Si necesitas los promedios de muchos alumnos, mira cómo lo hace `services/precalentar-promedios.service.ts`.
- **Toda ruta nueva o cambiada entra en `tests/integration/consultas-que-no-crecen.test.ts`** (N1-*): la ruta debe hacer **las mismas consultas con 3 que con 15 alumnos**.
- **Lo caro se guarda en la memoria rápida** (`RedisCache`, `config/redis.ts`). La llave lleva el liceo solo (`config/ambito-del-liceo.ts`): lee la sección «Memoria rápida» de CLAUDE.md. Y se borra cuando cambia el dato (mira cómo se invalida `promedioDelLapso` en `grades.service.ts`).
- **Una petición por pantalla** cuando se pueda (el Inicio de cada rol: una sola ruta, como `/dashboard/admin`).
- **Mide antes y después** (`npm run medir:pantallas` en el backend) y pon los números en el informe.

## 2. Reglas de la casa que no se negocian

- **Permisos** (CLAUDE.md, «Permisos»):
  - el profesor **solo lo de sus clases**;
  - el alumno solo lo suyo y **no escribe nada**;
  - el representante solo a sus representados.
  - Se comprueba **en el servidor**: `services/authorization.service.ts` (`assertClassroomScope` para escribir, `assertCanSeeClassroom` y `canSeeStudent` para leer). Esconder un botón no es seguridad.
  - Toda ruta nueva lleva `authenticate` en su `preHandler`.
- **El rol lo dice el servidor:** en la web, `useQuienSoy()`, no `useAuthStore().user.role`.
- **Fechas:** `useSchoolToday()` y `utils/school-time.ts`, nunca `new Date()` a secas para «hoy».
- **Migraciones de los liceos** (`apps/backend/src/prisma/migrations/`):
  - a mano;
  - empiezan con `SET lock_timeout = '10s';`;
  - `prisma migrate deploy`, jamás `db push`.
  - Mira una existente.
- **Cada liceo es un esquema.** El SQL a mano va por el cliente de ese liceo (CLAUDE.md, primer párrafo).
- **Cálculos:** todo cambio de cómo se calcula algo se anota en `docs/MAPA_DE_CALCULOS.md`.
- **Sin señal se trabaja:** una pantalla nueva lee sus datos con `useQuery` (si no, no se ve sin conexión).
  - **Al cambiar lo que lee una pantalla, vuelve a grabar las lecturas:** `GRABAR=1 npx playwright test grabar-lecturas` (PRECARGA-MAPA se pone en rojo si no).
- **Teléfono:** `npm run movil -- --exigir` debe seguir en verde: nada se sale de ancho, todo lo que se pulsa mide 44 px o más y ningún texto baja de 12 px.

---

## Fase A — El aviso «Sin conexión» que parpadea

**Qué pasa.** Con el servidor de pantallas (Next, 3000) caído y el de datos (3001) arriba, el aviso de arriba a la derecha (`AvisoSinConexion`) parpadea.
- `hooks/useConexion.ts` pregunta a `/health` del servidor de datos, que contesta, y llama a `elServidorContesto()`.
- Pero `/api/auth/refresh` y `/api/auth/me`, que pasan por Next, fallan y llaman a `elServidorNoContesta()`. Así sin parar.

**Qué hacer** (`apps/web/src/hooks/useConexion.ts`, `apps/web/src/lib/estado-del-servidor.ts`):
1. La pregunta periódica comprueba **los dos caminos**: `/health` de la API y una petición mínima al propio origen de la web (una ruta ligera que ya exista o una nueva, `GET` sin datos y `no-store`). «Contesta» solo si responden los dos.
2. **Que no rebote:** tras un fallo, para volver a «contesta» hacen falta **2 respuestas buenas seguidas y ningún fallo en los últimos 10 s**. Un fallo pone «no contesta» en el acto, como hoy.

**Prueba:** una de navegador (en `tests/e2e/servidor-apagado.spec.ts` o una nueva) que tumbe **solo** las rutas de Next con `page.route` (`/api/auth/**` → abort), deje la API arriba y compruebe que el aviso aparece y **no desaparece** durante 40 s.
- **Tiene que fallar con el código de antes** y pasar con el nuevo: pon las dos salidas en el informe.

## Fase B — La descarga de la primera vez, preparada de antemano («paquete»)

**Por qué tarda hoy (medido).** El admin del liceo de pruebas baja 9.506 lecturas en 64 bloques.
- **La red no es el problema:** 34 MB guardados viajan como 2,2 MB comprimidos.
- El tiempo (~52 s) es **preparar** cada lectura en el momento: `POST /precarga/bloque` hace `fastify.inject` como esa persona, una a una.
- Con 3.000 alumnos serían unos 4–5 minutos. Cristian quiere que vaya «como bajar una app de la Play Store»: a la velocidad del internet.

**Lee antes:**
- la sección «La precarga» de CLAUDE.md;
- `apps/backend/src/services/precarga.service.ts`, `apps/backend/src/routes/precarga.routes.ts`;
- `apps/web/src/lib/precarga.ts`, `apps/web/src/lib/respuestas-guardadas.ts`;
- `apps/web/src/components/arranque/PrecargaAlEntrar.tsx`.

**La idea.** El servidor arma **de antemano** el paquete de cada persona y lo guarda. El teléfono lo baja **de un tirón como un archivo** y luego pide solo lo que cambió desde que se armó, con `POST /precarga/cambios {desde: marca}`, que **ya existe**. Que el paquete sea de hace horas no importa: lleva su marca.

### Servidor

1. **Tabla nueva en el esquema de cada liceo:** `paquetes_de_precarga`.
   - Columnas: `usuarioId` (única), `contenido` bytea (gzip), `marca` bigint, `version` text, `huella` text, `bytes` int, `lecturas` int, `armadoEn` timestamptz, `usadoEn` timestamptz.
   - Migración en `apps/backend/src/prisma/migrations/` con `SET lock_timeout`, y el modelo en `schema.prisma`.
   - En el respaldo (servicio `respaldos`), sus **datos** van fuera (`--exclude-table-data`): se rehacen solos.
2. **`services/paquete-de-precarga.service.ts`:**
   - **`elMenuDelRol(rol, conPagos, conPae)`:** el mismo menú que `apps/web/src/lib/el-menu.ts` (`elMenuDe`), copiado en el servidor. Pon un comentario en los dos lados que diga que van copiados, y una prueba que compare las dos listas.
   - **`laHuella(prisma, usuario)`:** un resumen corto de **lo que puede ver**: rol, `isActive`, ids ordenados de las secciones que guía y donde imparte (`lasSeccionesDelProfesor` de `precalentar-promedios.service.ts`), ids de sus representados y ciclo activo. **Con 2–3 consultas, no más.**
   - **`armarElPaquete(fastify, liceo, usuarioId)`:**
     - `marca = laUltimaMarca()` **antes** de leer;
     - el plan con `lasPantallasDe` y `elPlanDeLasPantallas`, con el menú de arriba;
     - si es admin o profesor, `precalentarLosPromedios` primero (como la ruta del plan);
     - las lecturas con `fastify.inject`, como `/precarga/bloque`, con las cabeceras de **ese usuario**: una credencial de acceso corta, de 10 minutos y solo en memoria, con `generateTokenPair` (`config/jwt.ts`), más `CABECERA_INTERNA: MARCA_INTERNA` y el slug del liceo;
     - 4–6 a la vez como mucho;
     - el resultado, **una línea JSON por lectura** (`{"c":clave,"d":datos}`, o `{"c":clave,"f":estado}` si no dio 200), comprimido en gzip y guardado con `marca`, `version`, `huella`, `bytes` y `lecturas`.
   - **La cola:** como mucho **1 paquete a la vez por proceso**, con un **candado en Redis** (`SET NX` con caducidad, como DOBLE-*) por `liceo|usuario`, para que dos procesos no armen el mismo. Sin Redis, el candado en el proceso.
   - **`encargarElPaquete(liceo, usuarioId)`:** lo pone en la cola si no hay uno vigente (misma huella y de menos de 24 h) y no se está armando ya.
3. **Cuándo se encarga:**
   - **al entrar con la contraseña** (el login correcto, en `auth.service.ts`): `encargarElPaquete` **sin esperar**, y sin que un fallo afecte al login (`avisarSiFalla`);
   - **de noche**, en `jobs/mantenimiento.job.ts`: para quien tiene paquete y lo usó en los últimos 7 días (`usadoEn`), **ponerlo al día solo con lo que cambió**.
     - `loQueCambioDesde(prisma, usuario, menu, paquete.marca)` dice qué lecturas tocan; se rehacen solo esas, se mezclan con las del paquete y se guarda con la marca nueva.
     - Si cambió la huella, o lo que cambió es más de la mitad, se arma entero.
     - Quien no usó la app en 7 días: su paquete se borra (no se mantiene lo que nadie baja).
4. **`GET /api/precarga/paquete`** (con `authenticate`; **solo el suyo**, el usuario sale del token y nunca de un parámetro):
   - vigente y con la huella de ahora → **200** con el archivo:
     - `application/octet-stream` (NO `Content-Encoding`: el teléfono lo descomprime, así el progreso son bytes de red reales);
     - `Content-Length`;
     - `Accept-Ranges: bytes`;
     - cabeceras `X-Paquete-Marca`, `X-Paquete-Version` y `X-Paquete-Lecturas`.
     - **Soporta `Range`** (206) para seguir donde se cortó.
     - Apunta `usadoEn`.
   - Se está armando → **202** `{ armando: true, hechas, total }`.
   - No hay o no vale → **404**, y además lo encarga.
   - Que el compresor general (`@fastify/compress`) **no** vuelva a comprimir esta ruta.

### Teléfono (`apps/web/src/lib/precarga.ts`, `bajarTodoMidiendo`)

1. Primero `GET /precarga/paquete`:
   - **202**: espera 1,5 s y vuelve a preguntar. El libro dice «Preparando tu paquete… N %» (`PrecargaAlEntrar.tsx`).
   - **404** o un error que no sea de conexión: el camino de hoy (plan y bloques), tal cual.
2. **200:** `fetch` con lectura en streaming, `body.pipeThrough(new DecompressionStream('gzip'))` y `TextDecoderStream`, partiendo por líneas.
   - El progreso: bytes recibidos / `Content-Length`, y la velocidad real (reutiliza el cálculo de ventana que ya hay).
   - **Si se corta:** al volver la conexión, `Range: bytes=<recibidos>-` y se sigue (guarda en `localStorage` la versión y cuánto se recibió).
3. Por **tandas de 500 líneas**, una sola transacción (`guardarRespuestas`). Los fallos 4xx, como hoy (`apuntarLosFallos`); los 5xx no se guardan y se piden luego por bloques.
4. Al acabar: `POST /precarga/cambios {desde: X-Paquete-Marca}` y bajar solo eso, por bloques (como `ponerseAlDia`). Después las páginas y la cáscara, como hoy.
5. **Sigue sin poder saltarse** (decidido por Cristian): «Sin conexión, esperando…» y, si cierra la app a medias, al abrir vuelve al login (ya hecho, BLOQUEO-UI-09).

### Pruebas

- **`tests/integration/precarga.test.ts`:**
  - **PAQUETE-07:** se arma, se sirve completo, con `Range` devuelve 206 y el trozo justo, y **otro usuario recibe el suyo, nunca el ajeno**;
  - **PAQUETE-08:** si cambia la huella (al profesor le quitan una sección), no se sirve el viejo (404) y se encarga uno nuevo;
  - **PAQUETE-09:** puesto al día de noche, rehace **solo** las lecturas cambiadas (cuéntalas) y su marca avanza;
  - **PAQUETE-10:** el paquete de un profesor no lleva nada que a mano le daría 403 (como PAQUETE-01…05).
- **Navegador:** PRECARGA-01…07 en verde (por el paquete), y una variante con el paquete en 404 que pase por el camino de reserva.
- **Medir** (`tests/e2e/precarga.spec.ts` imprime «PRECARGA admin: N s»): el admin y el profesor, antes y después, con el paquete ya armado. **Meta: el admin en menos de 10 s en este PC.**

## Fase C — El Inicio del teléfono para cada rol

Hoy el admin tiene en el teléfono `components/dashboard/InicioDelAdminMovil.tsx` (azul, promedio con ojo, dos tarjetas, carrusel de accesos, franja de hoy, cuadro de honor) y su esqueleto `EsqueletoDelInicioMovil`. **Solo en el teléfono** (`lateral:hidden`): en el ordenador sigue `app/(dashboard)/dashboard/page.tsx` como está, con los datos nuevos en sus tarjetas (`CifraCompacta`).

1. **Saca de ahí una pieza común `InicioMovil`** (azul, cifra grande con ojo, dos tarjetas con su barra, hoja, carrusel de accesos y un hueco para lo de debajo). El del admin queda **igual que hoy**, ahora encima de la pieza.
2. **Profesor:** amplía `getTeacherDashboard` (`services/dashboard.service.ts`), una sola petición:
   - **Promedio general:** las parejas (sección, materia) **del ciclo activo** donde `classroom_subjects.teacherId` es él.
     - Por cada sección, **una** llamada a `bulkSubjectAveragesConDatos` con sus alumnos y SOLO sus materias. Promedio = media de los promedios alumno-materia con notas, sin apreciaciones (`NOTAS_QUE_CUENTAN`).
     - Ejemplo de Cristian: Inglés en 4 secciones y Matemática en 2 = 6 parejas.
     - Guárdalo en `RedisCache` como el promedio del liceo (`getCycleGlobalAverage`).
     - Anótalo en `MAPA_DE_CALCULOS.md`.
   - **Asistencia:** la de sus clases en los últimos 30 días (un `groupBy` por estado).
   - **En riesgo:** alumnos distintos con alguna de SUS materias por debajo de `notaMinimaAprobatoria` del liceo.
   - En la pantalla, debajo de los accesos, **su horario en vivo** (el componente de horario que ya usa la clase en vivo y el alumno, en su forma de profesor) y debajo la franja de eventos de hoy.
   - **Sin cuadro de honor.**
   - Accesos: **Académico, Materias, Horarios, Observaciones y «Mi sección guía»** (solo si guía alguna).
3. **Alumno:** promedio general; al lado, **su puntaje del cuadro de honor y los puestos que subió o bajó**.
   - **Su puesto solo si está entre los 10 primeros: de su año (`puestoAno ≤ 10`) y/o del liceo (`puestoLiceo ≤ 10`)**, decidido por Cristian.
   - Cambia `routes/cuadro-de-honor.routes.ts` (`/alumno/:studentId`): hoy solo el admin recibe `puestoAno` y `puestoLiceo`. Al alumno y su representante, cada uno **solo si es ≤ 10**.
   - Prueba en `cuadro-de-honor.test.ts`: el 10.º lo recibe, el 11.º no.
   - Cambia también la frase de CLAUDE.md («ni su puesto») por la regla nueva.
   - Accesos: **Académico, Materias, Horarios y Actividades.**
4. **Representante:** promedio general de sus representados y, debajo, la lista (`MisRepresentados`). Al tocar uno, las pantallas del alumno de ESE hijo (con `?alumno=<id>`, como ya hace Mi clase).
5. `lib/el-menu.ts` (`elMenuDe`, `losDeLaBarra`) con lo de cada rol, y lo que dependa de eso: RECORRIDO-01 y `lib/recorridos.ts` si se quita o renombra un `data-recorrido`.
6. **Pruebas:**
   - N1-06 (panel del profesor) sigue igual con 3 y 15 alumnos;
   - una prueba del servidor de las cifras del profesor con datos conocidos;
   - de navegador por rol: el profesor no ve el cuadro de honor, el alumno no ve el puesto si es el 11.º;
   - `npm run movil -- --exigir`.

## Fase D — Las pantallas del profesor (solo mira lo suyo)

- **Académico** (`app/(dashboard)/dashboard/academico/**`): los ciclos en los que dio clase, **sin crear ni editar**. Dentro de un ciclo, **solo sus secciones**; dentro de una sección, **solo sus materias**, con pestañas 1.er / 2.º / 3.er lapso / ciclo completo.
  - El filtro va **en el servidor**: las listas de ciclos y secciones para el profesor, el mismo criterio que `tests/integration/las-secciones-que-me-tocan.test.ts`, y también ciclos cerrados.
  - Abrir por dirección una materia que no es suya: 403 o pantalla vacía.
  - En el ciclo activo, su clase sigue como hoy: pone notas y asistencia.
- **Mi sección guía** (nueva, `/dashboard/mi-seccion-guia`): el cuadro general de cada sección que guía, con todas las materias y alumnos, por lapso. Con lo que ya existe (`assertCanSeeClassroom`, `promediosDeLaSeccion`).
  - **Solo ver.** Las materias que no son suyas no llevan enlace a la clase ni botones.
- **Horarios:** solo SU horario (`/dashboard/horarios/profesor/<su id>`), sin nada que edite. Las rutas de escribir horarios ya son del admin: compruébalo con una prueba.
- **Observaciones:** solo las que él creó, en una clase o desde el panel. El filtro va en el servidor, en `observations.controller.ts`.
- **Pruebas** de permisos del servidor y del navegador para cada cosa, y N1-* de cada lista nueva.

## Fase E — Las pantallas del alumno (y del representante, por hijo)

- **Académico:** sus años (1.º, 2.º…), solo los que tiene. Dentro, su promedio general y cada materia, con un filtro por lapso o el ciclo completo. Usa lo de la boleta (`boletaDelAlumno`, `GET /boleta/:id?ciclo=&lapso=`), sin calcular de nuevo.
- **Al tocar una materia → Mi clase** (`/dashboard/mi-clase/<materia>`, ya existe con su plan de evaluación y sus actividades hechas y pendientes). Añádele arriba **el horario en vivo de esa materia** («cuándo te toca»).
- **Materias:** las de su año, cada una a Mi clase.
- **Horarios:** su horario en vivo.
- **Actividades:** lo hecho y lo pendiente (`components/profile/ActividadesDelAlumno`).
- **El representante:** todo lo anterior con `?alumno=`. El servidor ya lo controla (`canSeeStudent`, MICLASE-*). Prueba que no puede ver a un alumno que no tutela.
- **El alumno no escribe nada:** compruébalo en el navegador (ningún botón de guardar).

---

## Al acabar todas las fases

- `CLAUDE.md`: las secciones de la precarga, el Inicio y los permisos del profesor puestas al día.
- Volver a grabar las lecturas (`GRABAR=1`).
- La tanda entera:
  - jest del servidor con Redis 6391;
  - typecheck;
  - `tsc` y jest de la web;
  - e2e de precarga, bloqueo, movil, contraste, recorrido y los nuevos.
