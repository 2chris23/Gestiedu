# ¿Listo para el piloto?

Cristian (19-oct-2026): «tú eres mi programador manager, tú me dices cuándo
estará listo el sistema». No se busca liceo piloto hasta que las **cuatro
puertas** estén al 100 %, **medidas**. Este archivo dice dónde está cada una,
con su evidencia, y se actualiza al cerrar cada tanda de trabajo.

**Estado al 19-oct-2026 (tarde): NO está listo.** Lo que falta está abajo, en orden.

**Desarrollo antes de producción** (CLAUDE.md, 0-ter): ni dominio ni servidores
hasta cerrar las cinco etapas. Drive, el abogado y el titular de lo legal esperan.

| Etapa | Estado |
|---|---|
| 1. Implementación | 🟡 Grupos estables, fases 3–5 por hacer |
| 2. Corrección de diseño | 🟡 Continua, con Cristian mirando |
| 3. Revisar de pie a cabeza | 🔴 Empieza ahora: arquitectura, archivos de más de 800 líneas (17 pasan de 1.000), lo obsoleto |
| 4. Que todo funcione | 🟡 Ver puertas 1 y 4 |
| 5. Estrés: 10.000 a la vez, ≤ 100 ms | 🟡 Medido por escalones y proyectado: un proceso, ~400–500 a ≤ 100 ms; harían falta ~10–12 procesos para 10.000 (falta probarlo en un servidor) |

| Puerta | Qué exige | Estado |
|---|---|---|
| 1. Cero errores | jest y navegador enteros en verde; Salud sin errores abiertos; barrido de privacidad limpio; la misma cifra en todas partes | 🟡 jest entero en verde (1.446). Navegador: la descarga sin conexión, 8 de 9 (falta la velocidad del admin); falta la tanda entera (316) |
| 2. No se pierde nada | lo hecho sin conexión sube; los respaldos vuelven; nada se borra sin copia; nada se pisa callado | 🟡 Probado por partes; hoy se cerraron dos huecos. Falta la prueba de caos y la copia fuera del servidor |
| 3. Rápido con 100.000 | más de 10.000 a la vez a ≤ 100 ms (p99), sin romperse; medido por escalones en este PC y proyectado | 🔴 Medido solo en este PC. Hace falta el servidor de verdad |
| 4. Cada opción funciona | cada botón de cada rol, con su prueba | 🟡 Servidor: 455 de 456 opciones vistas funcionando. Falta lo mismo en las pantallas |

## Puerta 1 — Cero errores

**Cómo se mide:**

```bash
cd apps/backend && npx jest
npm run test:e2e
```

y `/superadmin/salud` → Errores, sin ninguno abierto.

**Medido hoy:**
- **jest entero: 191 de 191 archivos, 1.446 pruebas en verde, 0 fallos** (5 saltadas: piden un Redis de pruebas, `REDIS_PRUEBAS_URL`).
- **La descarga sin conexión en el navegador (PRECARGA-01…09): 8 de 9.** Cada rol entra, baja lo suyo y, sin conexión, abre cada pantalla de su plan entera: profesor (3 s, 1,5 MB), alumno, representante y admin (3 s, 12,7 MB; todo lo que no es ficha y 25 fichas).
  - Arreglado hoy para llegar ahí: el horario propio del profesor y la labor social de 5.º no estaban en la descarga, y la grabadora del mapa no veía nada con la web compilada (escribía un mapa vacío dando verde; ya no puede).
  - **En rojo, la velocidad del admin (PRECARGA-09): 14,2 s con 38 Mbps y el procesador ×4 más lento, meta ≤ 10 s.** Medido sin nada más corriendo. Va con la puerta 3.
- **Trampa encontrada:** con `npm run tunel`, el servidor de datos deja de recargarse al editar. Antes de una prueba de navegador se mira que el proceso sea nuevo.

**Falta:**
- La tanda entera de navegador (316 pruebas).

## Puerta 2 — No se pierde nada

**Hecho y probado:**
- La papelera: todo borrado guarda copia, también la cascada.
- Lo pendiente sin conexión sube solo y no se aplica dos veces (`X-Cambio`, SINCON-*).
- Nada se pisa callado (409 `CAMBIO_MIENTRAS_TANTO`).
- Los respaldos se recuperaron tabla por tabla (simulacro del 11-oct).
- El teléfono guarda cada cubo sin borrar los demás.

**Encontrado hoy y arreglado:**
- **La descarga amanecía con lo de ayer.** La noche de los cubos corría cada 24 h desde que arrancaba el servidor, no a la medianoche del liceo. Con el servidor encendido a las 7, sin conexión faltaban la clase en vivo y los reemplazos de hoy. Ahora cada barrido pone en la cola a quien tenga el índice de otro día (`elDiaNuevo`, CUBO-07). Comprobado en el navegador: el alumno y el representante pasan enteros sin conexión.
- **Una clase con trabajo se podía quitar** por dos rutas viejas («quitar la materia de un grado» y «de una sección»), con sus notas y actividades a la papelera. Ahora responden 409 `CLASE_CON_TRABAJO`, igual que «Dónde se da» (VIEJA-01).

**Falta:**
- Prueba de caos: tumbar la base 30 s en medio de una tanda de escrituras y comprobar que nada se perdió.
- Respaldos fuera del servidor, en marcha de verdad (R2), con una recuperación probada desde allí.

## Puerta 3 — Rápido con 100.000 personas (más de 10.000 a la vez, p99 ≤ 100 ms)

**Medido el 19-oct-2026 por escalones** (`npm run medir:estres`, este PC: el generador, PostgreSQL, Redis y el servidor en la misma máquina de 12 hilos; 50 liceos sembrados con `seed:muchos-liceos`; una conexión por liceo).

**Primero se encontró y arregló lo que lo rompía:**
- **Con 200 personas, todo a 6 s** (hasta `GET /time`). Había tres causas:
  - el Inicio del admin recalculaba el promedio del liceo materia por materia: 31 s cada vez;
  - el armado de cubos de fondo no se apartaba de la gente;
  - quedaban servidores viejos encendidos.
- **Ahora:**
  - el Inicio del admin calcula una sola vez las cifras del año;
  - el trabajo de fondo espera a que no haya gente pidiendo (`utils/la-gente-esperando.ts`);
  - el Inicio del alumno ya no hace la cuenta dos veces;
  - las notas se leen solo del ciclo y de sus secciones.
- **Con varios procesos, nadie podía entrar.** Cada proceso, al arrancar, abría una conexión a cada liceo (para sincronizar el estado de los años y revisar el disco) y la base se quedaba sin clientes. Ahora esas tareas corren una vez entre todos los procesos.

**Un proceso, 10 liceos:**

| Gente a la vez | Pet/s | p50 | p95 | p99 |
|---|---|---|---|---|
| 100 | 50 | 4 ms | 39 ms | 75 ms |
| 200 | 98 | 12 ms | 52 ms | 109 ms |
| 400 | 197 | 14 ms | 59 ms | **82 ms** |
| 800 | 377 | 22 ms | 463 ms | 1.081 ms |
| 1.200 | 433 | 380 ms | 2.296 ms | 3.339 ms |

**Cuatro procesos, 10 liceos:**

| Gente a la vez | Pet/s | p95 | p99 |
|---|---|---|---|
| 400 | 197 | 46 ms | 77 ms |
| 800 | 388 | 217 ms | 425 ms |
| 1.200 | 507 | 1.118 ms | 2.376 ms (el generador ya se ahoga: 74 ms) |

**Qué se lee de las tablas:**
- **Un proceso:** aguanta unas **400–500 personas a la vez con p99 ≤ 100 ms**.
- **Cuatro procesos en el mismo PC:** no dan cuatro veces más. Comparten la base, Redis, el generador y los 12 hilos; el techo aquí es la máquina.

**La proyección (las dos cuentas, `proyectar` en `medir-estres-incremental.ts`):**
- **La de Cristian (el % por cada doble):** cerca del techo, el p99 crece +130 % a +560 % por doble. Proyectada así, con un solo proceso daría minutos a 10.000 personas. No es real: es justo la zona donde el tiempo se dispara.
- **Colas (Erlang C ajustado a lo medido):** el tiempo de servicio es de 11–13 ms por petición, y cada persona hace ~0,48 peticiones/s.
  - Para **10.000 a la vez con p99 ≤ 100 ms** hacen falta unos **10–12 procesos** como este, con PgBouncer y una base que los aguante.
  - Para 100.000, unos 90–117.
  - El modelo se equivoca un 45–58 % frente a lo medido en este PC. Es un orden de magnitud, no una promesa.

**Veredicto:** con este código, **10.000 a la vez a ≤ 100 ms es alcanzable repartiendo en ~10–12 procesos**, porque el p99 sin cola es de ~60 ms. **No está demostrado:** eso solo se mide en un servidor de pruebas, con el generador en otra máquina (`DESPLIEGUE.md` §10-bis).

**Falta para cerrar la puerta:**
- **PgBouncer obligatorio con varios procesos:** sin él no caben las conexiones.
- **Los cubos, en un proceso aparte** (`PRECARGA_TRABAJADORES=0` en los de la API).
- **Bajar más el trabajo de las pantallas más pesadas**, en este orden:
  1. el Inicio del alumno;
  2. la lista de alumnos;
  3. guardar la clase.
- **La prueba en un servidor de verdad**, y `statement_timeout`.

## Puerta 4 — Cada opción funciona

**Cómo se mide, pidiendo de verdad:**

```bash
cd apps/backend
RUTAS_PROBADAS=../../docs/mediciones/rutas-probadas npx jest
npx tsx src/scripts/acciones-sin-prueba.ts --probadas=../../docs/mediciones/rutas-probadas
```

Cada servidor de prueba apunta qué rutas recibió y con qué código (`utils/rutas-probadas.ts`). Así se ve cuáles solo se probaron por su rechazo (403, 400): nadie vio que funcionen.

**Medido hoy, en el servidor:**

| | Rutas |
|---|---|
| En total | 473 |
| Que pide alguna prueba | 473 |
| Sin pantalla (no se pulsan; cada una con su motivo en el guion) | 17 |
| Opciones que se pulsan | 456 |
| Opciones vistas funcionando | 455 |
| Opciones probadas solo por su rechazo | 1 (migrar un liceo desde el superadmin) |

Por la mañana eran 27 probadas solo por su rechazo.

**Fallos que salieron al probarlas, todos arreglados con su prueba:**
- Mover un bloque del horario mandaba el cuerpo entero a la base: se le podía cambiar la sección y la clase, saltándose la comprobación de choques (VIEJA-02).
- Un superadmin desactivado seguía renovando su sesión para siempre. Y una llave inventada daba 500 con el mensaje de la librería (SA-RENOVAR-01).
- Las dos de quitar clases de la puerta 2.

**Rutas sin pantalla (17).** Varias ni pueden funcionar: piden un `cuid` donde va la cédula, como `DELETE /students/:id` y `PUT /teachers/:id`. Los usuarios se gestionan en `/users`. **Pendiente: quitarlas** (menos puertas, menos que vigilar); hay que ajustar cinco pruebas de permisos que las nombran.

**Falta:**
- Migrar un liceo desde el superadmin, visto funcionando.
- Lo mismo en las pantallas: cada botón de cada rol pulsado en el navegador (crear un estudiante, poner un horario…). Hoy hay pruebas de navegador por módulo, no una lista que diga qué botón falta.

## Fecha estimada

Sin contar el servidor de verdad (puerta 3), que depende de contratarlo:

- **Puertas 1, 2 y 4 en este PC: unas 2 a 3 semanas de trabajo.**
- **Puerta 3: unos días después de tener el servidor.**

Hoy se avanzó en la 4 (del servidor, casi entera) y en la 1 (jest entero en verde).

Se corrige aquí cada vez que se mida algo nuevo.
