# Auditoría de escala: «nunca por culpa del sistema»

La regla, de Cristian (18-oct-2026; CLAUDE.md, punto 0): lo único que puede frenar a una persona es su teléfono o su internet, nunca el sistema. Gestiedu se hace para todos los liceos privados del país: 15.000 personas a la vez es el piso, no el techo.

Esta revisión recorre el servidor contra esa regla. Cada hallazgo dice:

- dónde está;
- la evidencia: lo medido o lo leído en el código;
- qué pasaría con mucha gente;
- qué se hizo.

**Gravedad:**

- **A**: rompe la regla con mucha gente. Hay que arreglarlo antes del piloto.
- **B**: gasta de más y se notará a escala.
- **C**: mejora, sin urgencia.

## Cómo se miró

1. **Mediciones con mucha gente a la vez**, en este PC, con el liceo de pruebas: 634 personas y 599 alumnos.
   - `tests/e2e/medir-muchos-a-la-vez.spec.ts`
   - `medir-primera-entrada.spec.ts`
   - `medir-armado.spec.ts`
2. **REA** sobre la captura de red (HAR) de la primera entrada del admin, para separar el tiempo de la red del tiempo del servidor.
3. **Un barrido del código** que busca consultas a la base dentro de bucles. Encontró 78 sospechosos, que se revisaron uno a uno.
4. **El panel de salud nuevo**: el robot y el medidor de cada ruta, encendidos durante la revisión.

## Hallazgos

### A1. La descarga inicial se armaba al entrar, de uno en uno — ARREGLADO

**Dónde:** `services/paquete-de-precarga.service.ts` (`armarElPaquete`, `ColaDePaquetesPorProceso`).

**Evidencia:**

- El admin, la primera vez, tardaba 122 s. De ellos, 117 s eran esperar al servidor. REA, sobre el HAR, midió que los 3,5 MB bajan en 0,3 s.
- Con 300 alumnos en frío, la mitad esperaba 57 s y el último 83 s, para bajar 27 KB cada uno.
- 298 de los 300 recibieron un 404 que los mandaba al camino viejo, así que el servidor trabajaba el doble.

**Con 15.000:** unos 0,28 s por alumno, de uno en uno, son más de una hora para el último.

**Hecho: la descarga en cubos** (`services/cubos-de-precarga.service.ts`, `lib/cubos.ts`; CLAUDE.md, «La descarga en cubos»):

- todo se arma antes;
- la cola vive en la base, con `SKIP LOCKED`;
- lo común se comparte;
- al entrar, solo se lee.

**Después:**

| Caso | Antes | Ahora |
|---|---|---|
| 300 alumnos a la vez, el último | 83 s | 2,2 s (ninguno en cola) |
| 100 cuentas sin índice, el último | — | 3,7 s |
| Primera entrada del admin | 122 s | 6,5 s |
| Primera entrada del profesor | 7 s | 2 s |

### A2. El teléfono guardaba un solo «paquete»: con varios trozos, se perdían — ARREGLADO

**Dónde:** `lib/respuestas-guardadas.ts` (`guardarRespuestasCrudas`).

Cada guardado reemplazaba el índice entero. Al bajar por cubos, solo quedaba el último, y sin conexión faltaban pantallas. Lo encontró la comparación de lo guardado (15 MB) con lo armado (35 MB).

**Hecho:** cada cubo guarda sus bloques y el índice se mezcla en fila.

### A3. El pronóstico dice que hoy, con 1 proceso, se cae antes de 15.000 — PENDIENTE (despliegue)

**Dónde:** `/superadmin/salud`, con el modelo de colas calibrado con lo medido.

Con lo medido en este PC (12 ms por petición sin cola, 4,8 peticiones por minuto por persona, 1 proceso × 10 conexiones):

- **se dobla** con unas 9.800 personas a la vez;
- **deja de dar abasto** con unas 10.600.

**Qué hace falta:** más procesos (`--scale backend=N`) y más conexiones (PgBouncer, `CLIENTES_DE_LICEO`). El panel lo recalcula con `PROCESOS_DEL_SERVIDOR` y `CONEXIONES_POR_PROCESO`.

**Con 4 procesos × 20 conexiones**, el mismo modelo pone el techo por encima de 80.000 personas a la vez.
