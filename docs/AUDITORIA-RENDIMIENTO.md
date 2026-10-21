# Auditoría de rendimiento (20–21 oct. 2026)

Pedida por Cristian, con cinco pilares:
1. menos peticiones por pantalla;
2. caché en el cliente;
3. lo fijo frente a lo que cambia;
4. consultas e índices;
5. límites en las listas.

La regla de la casa sigue mandando: **se mide primero y se cambia solo donde se ve el cuello**.

Este documento recoge cuatro cosas:
- lo medido;
- lo que ya estaba bien (y no se tocó);
- lo que se corrigió;
- lo que queda por decidir.

## Cómo se midió

- **`npm run medir:pantallas`**, con dos cambios:
  - ahora mide también la boleta, el Inicio del alumno y el horario del profesor;
  - acepta `LICEO`, `ADMIN` y `CLAVE` para medir otro liceo.
  
  Se midió en dos liceos: `instituto-testing` (637 personas) y `test-load-5k` (15.326 personas, 108 secciones, 5.000 alumnos inscritos).
- **Las métricas de Salud** de los últimos 3 días (`metricas_de_rutas`). Sirven para ver qué rutas se piden más; los tiempos están mezclados con las tandas de estrés.
- **Qué pide cada pantalla:** `precarga/lecturas-por-pantalla.json`, que la grabadora del navegador saca de verdad (60 pantallas por rol).
- **`pg_stat_user_tables`**, para los recorridos secuenciales de cada tabla, y un repaso del esquema: cada clave foránea con su índice.

## Fase 1: el diagnóstico

### 1. Peticiones por pantalla

- **El armazón** pide en todas las pantallas cinco cosas: `/avisos`, `/avisos/preferencias`, `/institutes/current/config`, `/pae/config` y `/payments/settings`.
  - TanStack Query las guarda 5 min, así que al cambiar de pantalla salen de memoria y no se vuelven a pedir.
  - Juntarlas en una sola ruta solo ahorraría la primera entrada, y esa ya la cubre la precarga.
  - **No se tocó.**
- **La pantalla más cargada es la sección:**
  - para el admin, 18 lecturas propias, más las del armazón;
  - para el profesor, 16;
  - la materia, 14–15;
  - la ficha de un alumno, 16.

  Casi todas son pestañas distintas que se piden a la vez (no en cascada). La única cascada es la de siempre: la sección se busca por su nombre en la dirección, y con su id salen las demás.
- **Lecturas dobles (corregido).** Cinco pantallas pedían lo mismo dos veces: una sin el dato que aún no tenían y otra con él. La primera se tiraba.

  | Pantalla | Lo pedido de más |
  |---|---|
  | Sección (admin, profesor, Labor social) | `/classrooms/<nombre>/stats` antes de saber el id |
  | Sección (admin) | `/students/available`, dos veces (sin año y con año) y **al abrir**, aunque solo lo usa la ventana «Inscribir» |
  | Materias (admin, profesor) | `/subjects` sin año y luego con año |
  | Ficha de un alumno (admin) | `/students/:id/dashboard` sin ciclo y luego con ciclo |
  | Académico del alumno y del representante | la boleta sin ciclo y luego con ciclo |

  En el servidor la boleta y el Inicio del alumno son de lo más caro. Pedirlos dos veces doblaba ese trabajo cada vez que se abría la pantalla.

### 2. La caché en el cliente

Ya estaba al nivel que pide el encargo (`providers/QueryProvider.tsx`):
- `staleTime` de 5 min y `gcTime` de 7 días, así que volver a una pantalla ya vista no pide nada;
- todo se guarda en el teléfono (`MemoriaDelTelefono`) y la precarga baja todo lo de cada persona la primera vez;
- el tiempo real refresca solo lo que está a la vista cuando otro cambia algo.

**No se tocó.**

### 3. Lo fijo frente a lo que cambia, en el servidor

- **Ya existe una memoria rápida** en Redis (`middleware/smart-cache.middleware.ts`, TTL en `config/cache-ttl.ts`). Tiene la llave del liceo y se limpia por destinatario en cada escritura (`plugins/avisar-cambios.ts`).
- **La llave lleva a la persona:** 600 alumnos que piden el mismo horario de sección guardan 600 copias, y el primero de cada uno espera al cálculo.
- **El admin no tiene copia,** a propósito: ve todo el liceo y acotar a quién afecta cada cambio es difícil de garantizar.

**Por qué no se hizo la `lru-cache` de un solo proceso del encargo:** CLAUDE.md dice «nada que importe vive en la memoria de UN proceso». Con `--scale backend=N`, cada proceso enseñaría otra cifra tras un cambio, y eso rompe «la misma cifra en todas partes».

Lo compartido de verdad ya está identificado y comprobado en la precarga (`DEL_LICEO` y `DE_LA_SECCION` en `cubos-de-precarga.service.ts`, PRECARGA-AMBITO).

| | Datos | Ruta | Hoy |
|---|---|---|---|
| **Fijo (igual para todos los del rol)** | configuración, configuración académica, membrete, pagos (ajustes), QR (ajustes) | `/institutes/current/*`, `/payments/settings`, `/asistencia-qr/configuracion` | 5–35 ms; copia por persona |
| **Fijo por sección** | horario, reemplazos del día, resumen en vivo | `/schedules/classroom/:id`, `/class-replacements`, `/sessions/live-overview` | 5–11 ms; copia por persona |
| **Cambia** | notas, asistencia, avisos, pagos, la clase en vivo | — | sin copia o con limpieza al escribir |

**Conclusión medida:** lo fijo ya responde en 5–35 ms. Compartir su copia ahorraría poco y toca la puerta de seguridad: el que llega primero tiene que estar autorizado igual que el siguiente. Queda propuesto, no hecho (ver «Lo que queda»).

### 4. Consultas e índices

**Medido en el liceo de 15.326 personas:**

| Pantalla | p50 | Por qué |
|---|---|---|
| Resumen del ciclo (admin) | **25,5 s** | 17,5 s cargando la tabla vieja `grades` (1,8 millones de filas) |
| Inicio del admin, en frío | **26,8 s** (luego 6 ms, con su copia) | lo mismo |
| Boleta de un alumno | 450 ms | lo mismo |
| Resumen de una sección | 400–800 ms | lo mismo |
| Materias de la sección con cifras | 211 ms | — |
| Alumnos de una sección (20) | 105–158 ms | — |
| Usuarios (pág. 1) | 22–26 ms | — |
| Horario, clase en vivo, materias | 5–11 ms | — |

**La tabla vieja `grades` no la escribe nada del sistema:** ningún `create`, `update` ni `upsert` fuera de los guiones de datos de prueba. Las notas de verdad viven en la clase en vivo (`class_activities.scores`). Pero **diez sitios la siguen leyendo** en cada cuenta:
- `bulk-averages`;
- `promedios-del-alumno` (3);
- `inicio/comun`;
- la lista de alumnos;
- el perfil;
- `mis-datos`;
- secciones de la materia.

En un liceo real está vacía y no cuesta nada. **En los liceos de prueba con datos sembrados es casi todo el tiempo**, y por eso contamina también lo que mide `medir:estres` con `test-load-5k`.

**Es una decisión de Cristian** (ver abajo). No se borró.

En `instituto-testing`, el resumen del ciclo hacía seis consultas seguidas. Ahora van a la vez, pero sigue en ~210 ms: casi todo es la cuenta oficial del año entero (`cifrasOficialesDelAno`). Es una pantalla del admin, que abre una persona.

**Índices:**
- **Hay 152**, y las tablas calientes (asistencia, actividades, plan, reemplazos, inscripciones) tienen el suyo.
- **Claves foráneas sin índice:** 37. La mayoría son `instituteId`, que no sirve en un esquema por liceo, o columnas que solo se usan al borrar en cascada.
- **Faltaba uno caliente:** las actividades por su fila del plan (`class_activities.planRowId`). Lo buscan guardar el plan, quitar un instrumento y lo enviado sin conexión. **Añadido** (migración `20261020100000`).
- Los muchos recorridos secuenciales de `pg_stat_user_tables` son de tablas pequeñas: con pocas filas, PostgreSQL prefiere leerlas enteras. No son un índice que falte.

**Escritura dentro de una lectura:** `GET /sessions/live-detail` hace un `updateMany` de las observaciones huérfanas del día cada vez que se abre la clase. Es barato (casi nunca encuentra nada), pero es una escritura en cada lectura. Queda anotado para pasarlo al momento de guardar.

### 5. Límites en las listas

- **Paginadas:** las listas que crecen con el liceo (usuarios, alumnos, la sección) van de 20 en 20 en el servidor.
- **Sin `take`,** pero acotadas por lo que nombran:
  - las observaciones de UN alumno;
  - los gastos y los pagos al personal de UN ciclo;
  - los eventos (de un año, o todos si no se dice: unos cientos por año);
  - las actividades de UNA clase.

  Con 10.000 personas a la vez cada una sigue siendo de decenas o cientos de filas.
- **No se encontró ninguna** que pueda devolver miles de filas de golpe a la pantalla.

## Fase 2: los patrones, adaptados sin coste

| Patrón (Meta, Discord, Linear…) | En Gestiedu |
|---|---|
| Cliente que no vuelve a pedir lo que ya tiene (Relay, Linear) | Ya está: TanStack Query, más lo guardado en el teléfono y la precarga |
| Bajarlo todo de antemano (sincronización local, Linear, PowerSync) | Ya está: los cubos de precarga |
| Aviso de cambio en vez de preguntar (Discord) | Ya está: el tiempo real y `cambios_del_liceo` |
| Agrupar peticiones iguales (DataLoader, *request coalescing*) | Está para abrir los clientes de la base (CONN-10). Propuesto también para la copia de Redis |
| Servir lo guardado y rehacer de fondo (*stale-while-revalidate*) | Propuesto para lo fijo del liceo |
| No pedir lo que aún no hace falta | **Hecho:** las cinco lecturas dobles de arriba |
| Paginación por cursor | Las listas grandes van por páginas. Hoy ninguna crece tanto como para necesitar cursor |

## Fase 3: hecho en esta tanda

1. **Cinco lecturas dobles fuera de las pantallas:**
   - la sección (`useLaSeccion`);
   - Materias;
   - la ficha del alumno (`useFichaDelUsuario`);
   - el Académico del alumno (`AcademicoDelAlumno`).

   Sus lecturas viejas salieron del mapa de la precarga.
2. **El resumen del ciclo** hace sus consultas a la vez (`estadisticas-del-ano.controller`).
3. **El índice** `class_activities(planRowId)`.
4. **`medir-pantallas`:**
   - la clase en vivo salía «FALLOS: 6» porque al guion le faltaba la fecha;
   - ahora mide la boleta, el Inicio del alumno y el horario del profesor;
   - mide otros liceos (`LICEO`, `ADMIN`, `CLAVE`).

## Lo que queda (por orden)

1. **Decidir qué se hace con `grades` (Cristian).** Nada la escribe. Quitarla de las cuentas:
   - bajaría a milisegundos el resumen del ciclo y el Inicio del admin en los liceos sembrados;
   - haría honrado `medir:estres` con `test-load-5k`.

   Pero cambia las cifras de esos liceos de prueba, que hoy salen de ella. Se haría en tres pasos:
   1. los guiones de datos siembran en la clase en vivo;
   2. las diez lecturas se quitan;
   3. la tabla se borra con su migración.
2. **Copia compartida para lo fijo del liceo** (`DEL_LICEO`), con la llave del rol en vez de la persona, y limpia en cada cambio. Ahorra poco hoy (5–35 ms), así que va después de lo de arriba.
3. **El resumen del ciclo del admin**, preparado de antemano como los promedios (`precalentar-promedios`), si con datos de verdad pasa de 200 ms.
4. Pasar el `updateMany` de `live-detail` al momento de guardar.
