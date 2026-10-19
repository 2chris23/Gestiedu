# ¿Listo para el piloto?

Cristian (19-oct-2026): «tú eres mi programador manager, tú me dices cuándo
estará listo el sistema». No se busca liceo piloto hasta que las **cuatro
puertas** estén al 100 %, **medidas**. Este archivo dice dónde está cada una,
con su evidencia, y se actualiza al cerrar cada tanda de trabajo.

**Estado al 19-oct-2026 (tarde): NO está listo.** Lo que falta está abajo, en orden.

| Puerta | Qué exige | Estado |
|---|---|---|
| 1. Cero errores | jest y navegador enteros en verde; Salud sin errores abiertos; barrido de privacidad limpio | 🟡 jest entero en verde (1.446). Navegador: la descarga sin conexión, 8 de 9 (falta la velocidad del admin); falta la tanda entera (316) |
| 2. No se pierde nada | lo hecho sin conexión sube; los respaldos vuelven; nada se borra sin copia; nada se pisa callado | 🟡 Probado por partes; hoy se cerraron dos huecos. Falta la prueba de caos y la copia fuera del servidor |
| 3. Rápido con 100.000 | medido con carga, sin doblarse | 🔴 Medido solo en este PC. Hace falta el servidor de verdad |
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

## Puerta 3 — Rápido con 100.000 personas a la vez

**Medido (en este PC, todo en la misma máquina):**
- 300 alumnos entrando a la vez por primera vez: el último tiene todo en 2,2 s.
- 500 personas en 50 liceos: p95 de 124 ms, 0 fallos.

**El pronóstico (Erlang C calibrado, `/superadmin/salud`):**

| Montaje | Se dobla con | Se cae con |
|---|---|---|
| 1 proceso × 10 conexiones | ~9.800 personas | ~10.600 personas |
| 4 procesos × 20 conexiones | — | más de 80.000 personas |

Para 100.000 hacen falta unos 6 procesos y PgBouncer. Es una cuenta, no una medición.

**Falta (no se puede hacer en este PC):**
- Un servidor de verdad y la prueba de `DESPLIEGUE.md` §10-bis, con el generador de carga en OTRA máquina.
- Rehacer de noche a todo un liceo grande. Hoy van unas 1,25 personas por segundo con 2 trabajadores; con 15.000 en un servidor son unas 3 h. Cabe en la noche, pero hay que medirlo allí.
- `statement_timeout` en el rol de la base (paso de despliegue).

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
