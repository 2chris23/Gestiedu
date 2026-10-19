# ¿Listo para el piloto?

Cristian (19-oct-2026): «tú eres mi programador manager, tú me dices cuándo
estará listo el sistema». No se busca liceo piloto hasta que las **cuatro
puertas** estén al 100 %, **medidas**. Este archivo dice dónde está cada una,
con su evidencia, y se actualiza al cerrar cada tanda de trabajo.

**Estado al 19-oct-2026: NO está listo.** Lo que falta está abajo, en orden.

| Puerta | Qué exige | Estado |
|---|---|---|
| 1. Cero errores | jest y navegador enteros en verde; Salud sin errores abiertos; barrido de privacidad limpio | 🟡 Por medir de nuevo entero (la última tanda completa es de antes de los cubos) |
| 2. No se pierde nada | lo hecho sin conexión sube; los respaldos vuelven; nada se borra sin copia; nada se pisa callado | 🟡 Hecho y probado por partes; falta la prueba de caos (tumbar la base a media tanda) |
| 3. Rápido con 100.000 | medido con carga, sin doblarse | 🔴 Medido solo en este PC. El pronóstico dice que 1 proceso se cae con ~10.600; hace falta el servidor de verdad |
| 4. Cada opción funciona | cada botón de cada rol, con su prueba | 🟡 462 de 473 rutas con prueba; falta medirlo pidiendo de verdad y cubrir las pantallas |

## Puerta 1 — Cero errores

**Cómo se mide:**

```bash
cd apps/backend && npx jest
npm run test:e2e
```

y `/superadmin/salud` → Errores, sin ninguno abierto.

**Hecho:**
- Pruebas de lo tocado esta tanda en verde: finanzas 12/12, salud 9/9, cubos 7/7, grupos 7/7, cierre 10/10, sin conexión, consultas, horarios.

**Falta:**
- La tanda entera de jest y de navegador, con las cifras puestas aquí.
- Encontrado hoy y arreglado: los cubos amanecían con lo de ayer (abajo, puerta 2).

## Puerta 2 — No se pierde nada

**Hecho y probado:**
- La papelera (todo borrado guarda copia, también la cascada).
- Lo pendiente sin conexión sube solo y no se aplica dos veces (`X-Cambio`, SINCON-*).
- Nada se pisa callado (409 `CAMBIO_MIENTRAS_TANTO`).
- Los respaldos se recuperaron tabla por tabla (simulacro del 11-oct).
- El teléfono guarda cada cubo sin borrar los demás (A2 de la auditoría de escala).

**Encontrado hoy (19-oct) y arreglado:** la noche de los cubos corría cada 24 h desde que arrancaba el servidor, no a la medianoche del liceo. Un servidor encendido a las 7 de la mañana dejaba la descarga con lo de ayer: sin conexión, la clase en vivo y los reemplazos de hoy no estaban (PRECARGA-01 lo vio). Ahora cada barrido pone en cola a quien tenga el índice de otro día (`elDiaNuevo`, CUBO-07).

**Falta:**
- Prueba de caos: tumbar la base 30 s en medio de una tanda de escrituras y comprobar que nada se perdió.
- Respaldos fuera del servidor, en marcha de verdad (R2), con una recuperación probada desde allí.

## Puerta 3 — Rápido con 100.000 personas a la vez

**Medido (en este PC, todo en la misma máquina):**
- 300 alumnos entrando a la vez por primera vez: el último con todo en 2,2 s.
- 500 personas en 50 liceos: p95 124 ms, 0 fallos.

**El pronóstico (Erlang C calibrado, `/superadmin/salud`):**
- 1 proceso × 10 conexiones: se dobla con ~9.800 y se cae con ~10.600.
- 4 procesos × 20 conexiones: por encima de 80.000.
- Para 100.000 hacen falta unos 6 procesos y PgBouncer. Es una cuenta, no una medición.

**Falta (no se puede hacer en este PC):**
- Un servidor de verdad y la prueba de `DESPLIEGUE.md` §10-bis, con el generador de carga en OTRA máquina.
- Rehacer de noche a todo un liceo grande: hoy van ~1,25 personas por segundo con 2 trabajadores. Con 15.000 en un servidor son ~3 h: cabe en la noche, pero hay que medirlo allí.
- `statement_timeout` en el rol de la base (paso de despliegue).

## Puerta 4 — Cada opción funciona

**Cómo se mide:**

```bash
cd apps/backend
npx tsx src/scripts/acciones-sin-prueba.ts                         # leyendo las pruebas
RUTAS_PROBADAS=../../docs/mediciones/rutas-probadas npx jest       # pidiendo de verdad
npx tsx src/scripts/acciones-sin-prueba.ts --probadas=../../docs/mediciones/rutas-probadas
```

La segunda forma es la buena: cada servidor de prueba apunta las rutas que recibió y con qué código (`utils/rutas-probadas.ts`). Dice también las rutas que solo se probaron por su rechazo (403, 400): nadie vio que funcionen.

**Hecho hoy:** de 473 rutas, 11 no salían en ninguna prueba al leerlas. Tres eran falsas alarmas (la prueba arma la dirección por trozos). Las demás tienen ya su prueba: categorías, anular gasto, el mes de finanzas, la tasa del día, el calendario de cobros (FIN-05), «mis grupos» del profesor (GRUPO-04), los expedientes del cierre (CIERRE-08) y el robot de Salud (SALUD-09).

**Falta:**
- La medición pidiendo de verdad, con la tanda entera, y cerrar lo que salga.
- Lo mismo con las pantallas: cada botón de cada rol pulsado en el navegador (crear un estudiante, poner un horario…). Hoy hay pruebas de navegador por módulo, no una lista que diga qué botón falta.

## Fecha estimada

Sin contar el servidor de verdad (puerta 3), que depende de contratarlo:

- puertas 1, 2 y 4 en este PC: **unas 2 a 3 semanas de trabajo**;
- la puerta 3: unos días después de tener el servidor.

Se corrige aquí cada vez que se mida algo nuevo.
