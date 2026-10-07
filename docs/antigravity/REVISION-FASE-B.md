# Revisión de la Fase B — NO APROBADA (Claude, 2026-10-06)

## Lo que está bien

- **El diseño:** tabla, migración con `lock_timeout`, huella, candado, `Range`, el camino de reserva y el respaldo sin los datos del paquete.
- **El servidor:** typecheck limpio y 47 pruebas en verde (precarga, respaldos, mantenimiento y auth).

## La medición que pedía el encargo (no estaba en el informe)

Hecha por Claude con `tests/e2e/zz-medir-38mbps.spec.ts`:
- web compilada en el 3108;
- red de 38 Mbps con 70 ms de latencia;
- el paquete ya armado;
- desde pulsar «Ingresar» hasta la precarga completa.

| CPU | Total | Detalle |
|---|---|---|
| ×4 (teléfono de gama media) | **94 s** | 10 s en «Sin conexión», luego 78 s de «bajando» a «páginas» |
| ×1 | **31 s** | 10 s en «Sin conexión», luego 19 s de «bajando» a «páginas» |

**La meta es ≤ 10 s con CPU ×4.** Esa prueba pasa a ser **PRECARGA-09** (en `precarga.spec.ts`, que exija `≤ 10 s`) y la temporal se borra.

## Lo que hay que arreglar (en este orden)

1. **Regresión de la Fase A: «Sin conexión» 10 s después de cada login.**
   - Medido: el aviso `[data-aviso="sin-conexion"]` sale al pulsar «Ingresar» y dura 10 s. La precarga espera (`hayConexion`) todo ese rato.
   - Alguna petición que falla al navegar del login al Inicio (cancelada o abortada por el cambio de página) cuenta como «no contesta», y la histéresis tarda 10 s en quitarlo.
   - Arreglo:
     - una petición **abortada o cancelada** (`AbortError`, `ERR_CANCELED`, navegación) **no es «no contesta»**;
     - busca cuál es, con su dirección, y ponla en el informe.
   - Prueba nueva: tras entrar, el aviso no aparece en ningún momento. Y APAGADO-04 debe seguir en verde.

2. **La ruta del paquete sale comprimida OTRA VEZ.**
   - `config: { compress: false }` no desactiva `@fastify/compress`. La respuesta sale con `content-encoding: br`, **sin `Content-Length`** (la barra no sabe el total) y brotli por encima del gzip (trabajo de CPU del servidor para nada).
   - Además, `fetch` de Node falla al leerla: `ERR__ERROR_FORMAT_HUFFMAN_SPACE`.
   - Arreglo: la opción de ruta correcta de `@fastify/compress` (`compress: false` en las opciones de la ruta, no en `config`) o `reply.header('content-encoding', 'identity')`, lo que funcione de verdad.
   - Comprobar con `curl -D -`: **sin** `content-encoding` y **con** `content-length`. Pon la salida en el informe, y una prueba en `precarga.test.ts`.

3. **El teléfono tarda 19 s (CPU ×1) / 78 s (CPU ×4) en guardar.** La red no es (son ~3 MB).
   - **Mide cada paso** (`performance.now()`): bajar, descomprimir, `JSON.parse`, IndexedDB y cambios. Pon la tabla en el informe.
   - Lo más probable es que `JSON.parse` de 34 MB más el clon estructurado de 9.513 objetos en IndexedDB sea lo caro.
   - Propuesta: **guardar la respuesta como TEXTO** (la línea `d` tal cual, sin parsear) y parsearla **al leerla** (`respuestas-guardadas.ts`, el camino de lectura). Así la precarga no parsea ni clona 34 MB.
   - Descomprimir **mientras llega** (`res.body.pipeThrough(new DecompressionStream('gzip'))`), no al final con un `Blob`.
   - Meta del presupuesto: descomprimir y leer ≤ 2 s, guardar ≤ 4 s, con CPU ×4.

4. **El primer ingreso de una persona nunca tiene paquete.**
   - Solo se arma al entrar (y el admin tarda ~50 s en armarse) o de noche si ya lo usó. Justo la primera vez, que es cuando sale la precarga, va lento.
   - Arreglo:
     - la tarea de la noche arma también el de los **ADMIN y TEACHER activos que no tengan paquete**, uno a la vez y en segundo plano;
     - y se encarga cuando el admin **crea** una cuenta de personal.
   - Alumnos y representantes se arman al entrar (tardan ~3 s).

5. **Vigencia de 24 h.**
   - La ruta rechaza un paquete de más de 24 h aunque su huella esté bien. Entonces se rearma entero (50 s), cuando `/precarga/cambios` lo pone al día solo.
   - Arreglo: vale mientras **la huella coincida** y su marca siga dentro de lo que guarda `cambios_del_liceo` (30 días; mira `mantenimiento`). La tarea de la noche ya lo mantiene al día.

6. **El servidor se congela al comprimir.**
   - `zlib.gzipSync` y `gunzipSync` sobre 34 MB bloquean el proceso entero: nadie del liceo recibe respuesta mientras tanto.
   - Arreglo: `zlib.gzip` / `gunzip` asíncronos (`promisify`).
   - Y no parsear para volver a escribir: la línea se arma con el texto que ya llega, `'{"c":' + JSON.stringify(clave) + ',"d":' + r.payload + '}'`, sin `r.json()` ni `JSON.stringify` de los datos.

7. **N+1 en la tarea de la noche.**
   - `actualizarPaquetesDeNoche` hace `user.findUnique` por cada paquete.
   - Arreglo: traer los usuarios en **un** `findMany({ where: { id: { in } } })`.

## Para aprobar

- Los 7 puntos resueltos.
- **PRECARGA-09 ≤ 10 s con CPU ×4 y 38 Mbps**, con su salida real.
- PRECARGA-01…08, APAGADO-01…04 y `precarga.test.ts` en verde.
- typecheck y `tsc`.
- La tabla de tiempos por paso.
