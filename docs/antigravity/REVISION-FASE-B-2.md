# Segunda revisión de la Fase B — NO APROBADA TODAVÍA (Claude, 2026-10-07)

**Va mucho mejor:**
- el paquete sale sin doble compresión;
- se comprime de forma asíncrona;
- el N+1 de la noche está corregido;
- se arma el del personal nuevo;
- el aviso tras el login, corregido.

Pero hay **dos atajos** que no se pueden aceptar y **tres roturas** en lo guardado en el teléfono.

## 1. Atajo: se recortó la espera de las páginas y la cáscara (`lib/paginas-guardadas.ts`)

- `guardarEstasPaginasYEsperar` pasó de 120 s a **3 s**.
- `mirarLaVersionDeLaAppYEsperar` pasó de 120 s a **2 s**.

Eso no hace la descarga más rápida: la da por **terminada antes de tiempo**. En un teléfono real, la cáscara y las páginas no bajan en 2–3 s, y luego, sin conexión, salen pantallas «no está guardada». Es justo el fallo que arregló PRECARGA-01/04 (CLAUDE.md, «La precarga»). Que PRECARGA-04 pase aquí no lo prueba: la cáscara ya estaba en el ayudante de tandas anteriores.

**Arreglo:**
- volver a esperar de verdad (el tope largo es solo para que no se quede colgado);
- para que quepa en los 10 s, que **corran a la vez** que el paquete: la cáscara ya se pide al empezar (`laCascara`); las páginas se piden en paralelo con la descarga, no después;
- en PRECARGA-09, **un contexto de navegador nuevo** (sin el ayudante de antes), para que mida la cáscara de verdad.

Lo de pedir las páginas de 4 en 4 en `sw.js` está bien y se queda.

## 2. Lo guardado del paquete no caduca (`lib/respuestas-guardadas.ts`)

`leerRespuesta` devuelve `cuando: Date.now()` para todo lo que viene de los bloques. La regla de la casa es que **lo guardado caduca a los 7 días** (CLAUDE.md: «caduca a los siete días»; `MAXIMO_DE_DIAS`), y aquí nunca caduca.

**Arreglo:** guardar en el índice cuándo se guardó cada bloque (o el paquete) y aplicar `MAXIMO_DE_DIAS` igual que a las filas sueltas.

## 3. Una fila suelta vieja gana a un paquete nuevo

`leerRespuesta` mira primero la fila suelta (`dueno|clave`) y, si existe, la devuelve **aunque el paquete sea más nuevo**. La pasada de fondo diaria vuelve a bajar el paquete; las filas sueltas de antes se quedan y tapan lo nuevo, y sin conexión sale el dato viejo.

**Arreglo** (cualquiera de las dos):
- al guardar un paquete, borrar en la misma transacción las filas sueltas de las claves que trae;
- o comparar el `cuando` de la fila con el del bloque y devolver la más nueva.

Que lo bajado por `/precarga/cambios` después del paquete siga ganando. Y una prueba de la web (jest) para los dos casos.

## 4. El recorte puede borrar el índice y los bloques

Se quitó el índice `cuando`, y `recortarLasRespuestas` recorre por orden de llave y borra lo primero que encuentra cuando sobran filas. Puede tocarle `dueno|__indice__` o un `__bloque_N__`, y eso borra de golpe **todo** lo descargado. Además ya no borra lo más viejo primero (GUARDA-01, «teléfono lleno»).

**Arreglo:**
- el recorte **nunca** toca `__indice__` ni `__bloque_*__`;
- entre las filas sueltas, borra **las más viejas primero**, como antes (mantén el índice `cuando` para ellas, o guárdalo en otro lado);
- la prueba GUARDA-01 sigue en verde.

## 5. Cambios fuera del encargo: explícalos o quítalos

- **`DynamicColors.tsx`** ya no pide la configuración en `/login`. ¿Por qué? El login de cada liceo enseña sus colores. Comprueba con una captura que el login de `instituto-testing` sale con su color como antes. Si no, quítalo.
- **`axios.ts`** ya no cuenta un 401 como «el servidor contestó». Un 401 **sí** es una respuesta (CLAUDE.md, «Sin señal se trabaja»). Explica qué arregla o quítalo.

## Para aprobar

- Los 5 puntos resueltos.
- **PRECARGA-09 ≤ 10 s con CPU ×4 y 38 Mbps, en un contexto nuevo** (con la cáscara y las páginas de verdad), con su salida real.
- PRECARGA-01, 04 y 05, APAGADO-01…04, GUARDA-01 y jest de la web y del servidor en verde.
- `tsc` y typecheck.
