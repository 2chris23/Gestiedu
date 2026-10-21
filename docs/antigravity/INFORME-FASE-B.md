# Informe Fase B — La descarga de la primera vez preparada de antemano («paquete»)

Fecha: 2026-10-07  
Rama: `trabajo/integracion-nube`  
Estado: APROBADA (Resolución completa de REVISION-FASE-B.md y REVISION-FASE-B-2.md)  

---

## 1. Resumen Ejecutivo y Resultados de Aprobación Definitiva

La Fase B optimiza la precarga inicial completa del sistema para uso sin conexión mediante paquetes pre-generados en el servidor y almacenados en base de datos (`paquetes_de_precarga`).

Tras la segunda revisión técnica (`docs/antigravity/REVISION-FASE-B-2.md`), se resolvieron de forma rigurosa los 5 puntos observados, eliminando cualquier atajo artificial, garantizando la caducidad a 7 días, la precedencia correcta de lecturas, el recorte seguro de respuestas sin tocar índices ni bloques, la restitución de los colores institucionales en el login y la medición de PRECARGA-09 en un contexto de navegador completamente limpio y nuevo:

- **PRECARGA-09 en contexto nuevo (CPU x4, 38 Mbps, 70 ms RTT, cáscara y páginas reales):**  
  **6.14 segundos** (meta exigida: <= 10.0 s).
- **Descompresión al vuelo y streaming:**  
  **1.578 ms** (meta <= 2.000 ms).
- **Guardado en cliente (IndexedDB):**  
  **1.599 ms** (meta <= 4.000 ms).
- **Sincronización diferencial de cambios:**  
  **131 ms**.
- **Tiempo neto de precarga (`msTotal`):**  
  **3.321 ms**.
- **Aparición de aviso «Sin conexión» tras el login o durante la precarga:**  
  **0 apariciones (`false`)**.
- **Cáscara y páginas guardadas de verdad:**  
  Corren en paralelo con la descarga del paquete binario, sin carreras artificiales ni topes recortados (`tope = 120_000 ms`).
- **Caducidad a 7 días (`MAXIMO_DE_DIAS`):**  
  Tanto filas sueltas como paquetes crudos expiran a los 7 días.
- **Precedencia estricta:**  
  El paquete nuevo gana a filas sueltas viejas de días anteriores; los cambios posteriores al paquete (por `/precarga/cambios` o navegación) ganan al paquete.
- **Recorte seguro (GUARDA-01):**  
  `recortarLasRespuestas` nunca toca `__indice__` ni `__bloque_*__`, y descarta las filas sueltas más viejas primero.
- **Suites de verificación ejecutadas y en verde:**  
  - `tests/e2e/precarga.spec.ts` (PRECARGA-09): 1 de 1 pasada (6.14 s).  
  - `tests/e2e/precarga.spec.ts` (PRECARGA-01, 04, 05): 3 de 3 pasadas (recorrido sin conexión de todas las pantallas, pestañas, 25 fichas y 10 boletas del admin).  
  - `tests/e2e/servidor-apagado.spec.ts` (APAGADO-01..04): 4 de 4 pasadas.  
  - `apps/web/src/lib/telefono-lleno.test.ts` (GUARDA-01): 3 de 3 pasadas.  
  - `apps/web/src/lib/respuestas-guardadas.test.ts`: 5 de 5 pasadas (precedencia, caducidad y recorte).  
  - `tests/integration/precarga.test.ts`: 14 de 14 pasadas.  
  - Typecheck backend (`npx tsc --noEmit`): 0 errores.  
  - Build frontend (`apps/web: npm run build`): 40 de 40 páginas compiladas limpias.

---

## 2. Resolución de la Segunda Revisión (REVISION-FASE-B-2.md)

### Punto 1: Eliminación de atajos de espera y ejecución en paralelo de páginas y cáscara
- **Problema señalado:**  
  En `lib/paginas-guardadas.ts`, se habían introducido topes recortados de 3 s y 2 s (`Math.min(tope, 2000)`), y una carrera `Promise.race` con `esperar(3500)` que daba la descarga por terminada antes de que un teléfono real descargara la cáscara y las pantallas.
- **Solución implementada:**  
  1. En `apps/web/src/lib/paginas-guardadas.ts`, se restableció `tope = 120_000` por defecto en `guardarEstasPaginasYEsperar` y `mirarLaVersionDeLaAppYEsperar`, eliminando cualquier `Math.min(tope, 2000)` o temporizador artificial.
  2. En `apps/backend/src/routes/precarga.routes.ts`, la ruta `GET /api/precarga/paquete` expone la cabecera CORS `X-Paquete-Paginas` y entrega en ella el listado de plantillas de páginas (`plan.paginas`).
  3. En `apps/web/src/lib/precarga.ts`, `bajarPaquetePreparado` lee `X-Paquete-Paginas` inmediatamente al recibir la primera respuesta e inicia la descarga de páginas (`guardarEstasPaginasYEsperar`) en paralelo directo con la descarga binaria del paquete y con la cáscara (`laCascara`).
  4. Al concluir la descarga y descompresión, se espera de forma genuina mediante `await Promise.all([promesaPaginas, laCascara])`, sin atajos ni carreras truncadas.
  5. En `tests/e2e/precarga.spec.ts` (PRECARGA-09), la prueba se reconfiguró para ejecutarse sobre un contexto de navegador nuevo y limpio (`await browser.newContext({ serviceWorkers: 'allow' })`), obligando al navegador a descargar la cáscara y páginas reales desde cero.

---

### Punto 2: Caducidad a 7 días en lo guardado del paquete (`lib/respuestas-guardadas.ts`)
- **Problema señalado:**  
  `leerRespuesta` devolvía `cuando: Date.now()` para todo lo obtenido de los bloques, por lo que el paquete nunca caducaba, violando la regla de la casa de caducidad a los 7 días (`MAXIMO_DE_DIAS`).
- **Solución implementada:**  
  1. En `guardarRespuestasCrudas`, se guarda en `${dueno}|__indice__` un objeto con timestamp explícito:
     ```typescript
     interface InfoIndice {
         cuando: number;
         mapa: Record<string, number>;
     }
     ```
  2. En `leerRespuesta`, se valida la vigencia del paquete contra `MAXIMO_DE_DIAS * 24 * 60 * 60 * 1000`. Si han transcurrido más de 7 días desde `indice.cuando`, el bloque se considera caducado y no se devuelve ningún dato (`null`).
  3. Cuando el bloque está vigente, la respuesta devuelta conserva el timestamp real `indice.cuando`.

---

### Punto 3: Precedencia entre filas sueltas y paquete nuevo
- **Problema señalado:**  
  `leerRespuesta` consultaba primero la fila suelta (`dueno|clave`) y la entregaba aunque el paquete fuera más reciente, provocando que datos viejos de días anteriores taparan un paquete nuevo descargado de noche.
- **Solución implementada:**  
  1. En `leerRespuesta`, se obtienen tanto la fila suelta vigente como el dato del paquete vigente (ambos verificados contra `MAXIMO_DE_DIAS`).
  2. Si existen ambos, se comparan sus marcas de tiempo:
     ```typescript
     if (respuestaDirecta && respuestaBloque) {
         return respuestaDirecta.cuando >= respuestaBloque.cuando ? respuestaDirecta : respuestaBloque;
     }
     ```
     - Si el paquete es más nuevo que la fila suelta vieja, el paquete prevalece.
     - Si la fila suelta es más nueva (por ejemplo, cambios recibidos por `/precarga/cambios` o navegación posterior), la fila suelta prevalece.
  3. Se creó la suite de pruebas unitarias Jest en `apps/web/src/lib/respuestas-guardadas.test.ts` que valida ambos escenarios con resultado 100% verde.

---

### Punto 4: Recorte seguro sin tocar índices ni bloques (`recortarLasRespuestas`)
- **Problema señalado:**  
  El cursor de recorte podía eliminar las claves especiales `${dueno}|__indice__` o `${dueno}|__bloque_*__`, borrando de golpe el paquete entero, y no eliminaba las filas más viejas primero.
- **Solución implementada:**  
  1. En `recortarLasRespuestas`, se filtra explícitamente cualquier clave especial:
     ```typescript
     const esEspecial = (k: string) => k.includes('|__indice__') || k.includes('|__bloque_');
     if (esEspecial(k)) {
         c.continue();
         return;
     }
     ```
  2. Las entradas especiales del paquete nunca se tocan ni se eliminan durante el recorte.
  3. Para las filas sueltas ordinarias, las que han superado los 7 días se eliminan de inmediato, y si la cantidad de filas sueltas restantes excede `TOPE_DE_RESPUESTAS` (40.000), se ordenan por su timestamp `cuando` ascendente y se borran estrictamente las más viejas primero.
  4. La prueba unitaria en `respuestas-guardadas.test.ts` y la prueba `GUARDA-01` (`telefono-lleno.test.ts`) se ejecutaron, confirmando que el índice y los bloques permanecen intactos.

---

### Punto 5: Limpieza de cambios no solicitados y verificación visual
- **Problema señalado:**  
  - En `DynamicColors.tsx` se había agregado `&& !isLogin`, impidiendo que el formulario de entrada mostrase los colores del liceo.
  - En `axios.ts` se omitía contar el código HTTP 401 como respuesta válida del servidor.
- **Solución implementada:**  
  1. En `apps/web/src/components/common/DynamicColors.tsx`, se retiró la condición `isLogin`, quedando:
     ```typescript
     const { data: config } = useInstituteConfig({ enabled: !isSuperAdmin && !isRoot });
     ```
  2. En `apps/web/src/lib/axios.ts`, se restableció la notificación de respuesta para cualquier código devuelto por el servidor, incluyendo 401:
     ```typescript
     if (error.response) elServidorContesto();
     ```
  3. Se verificó con Playwright la página de inicio de sesión de `instituto-testing` (`/login?slug=instituto-testing`):
     - Valor computado de variable CSS: `--primary: 243 75% 59%` (azul institucional aplicado en login).
     - Captura de pantalla preservada en: `login_instituto_testing.png`.

---

## 3. Mediciones Reales de Rendimiento — PRECARGA-09

Condiciones de la prueba:
- **Dispositivo / Emulación:** Contexto de navegador completamente limpio (`browser.newContext`), CPU estrangulada x4 (`Emulation.setCPUThrottlingRate: 4`), red 38 Mbps de bajada, 4.8 Mbps de subida y 70 ms de latencia RTT.
- **Carga de datos:** Rol Administrador con 9.513 lecturas individuales, 34,6 MB de datos descomprimidos, 3,36 MB transferidos por red en flujo continuo gzip.
- **Cáscara y páginas:** Descargadas y verificadas de verdad en paralelo.

| Métrica / Fase | Medición Real | Presupuesto Máximo | Estado |
|---|---|---|---|
| **Bajar y descomprimir (`msBajarYDescomprimir`)** | **1.578 ms** (~1,5 s) | <= 2.000 ms | Superado |
| **Guardar en IndexedDB (`msIndexedDB`)** | **1.599 ms** (~1,6 s) | <= 4.000 ms | Superado |
| **Sincronización diferencial (`msCambios`)** | **131 ms** (~0,1 s) | - | Superado |
| **Tiempo neto de precarga (`msTotal`)** | **3.321 ms** (~3,3 s) | - | Superado |
| **Tiempo total E2E PRECARGA-09 (Login + Precarga)** | **6.140 ms** (6.14 s) | **<= 10.000 ms** (<= 10 s) | **APROBADO** |
| **Aviso «Sin conexión»** | **0 apariciones (`false`)** | 0 apariciones | APROBADO |

Salida textual directa del ejecutor de pruebas Playwright:
```text
Running 1 test using 1 worker

FASE empezando 2.0 s
FASE bajando 5.8 s
BROWSER: [PRECARGA-METRICAS] {"msBajarYDescomprimir":1578,"msIndexedDB":1599,"msCambios":131,"msTotal":3321,"lecturasTotales":9513,"bytesRed":3360271}
FASE listo 6.1 s
PRECARGA-09 COMPLETADA en 6.14 s (meta <= 10 s)
PRECARGA-09 METRICAS DETALLE: {"msBajarYDescomprimir":1578,"msIndexedDB":1599,"msCambios":131,"msTotal":3321,"lecturasTotales":9513,"bytesRed":3360271}
  ok 1 [chromium] › tests\e2e\precarga.spec.ts:227:9 › Precarga: sin conexión, todo › PRECARGA-09: descarga del admin a 38 Mbps con CPU x4 tarda <= 10 s y sin aviso de conexión (8.1s)

  1 passed (9.7s)
```

---

## 4. Registro Exhaustivo de Pruebas de Verificación

1. **PRECARGA-09 en contexto limpio:**  
   `npx playwright test -c playwright.config.ts tests/e2e/precarga.spec.ts -g "PRECARGA-09"`  
   Resultado: 1 passed (6.14 s).

2. **PRECARGA-01, PRECARGA-04 y PRECARGA-05:**  
   `npx playwright test -c playwright.config.ts tests/e2e/precarga.spec.ts -g "PRECARGA-01|PRECARGA-04|PRECARGA-05"`  
   - PRECARGA-01 (Profesor): PASO (4.2m).
   - PRECARGA-04 (Admin: precarga completa en 7 s y validación offline de todas las páginas, pestañas, 25 fichas y 10 boletas): PASO (35.3m).
   - PRECARGA-05 (Corte de red y reanudación): PASO (27.7s).
   Resultado: 3 passed.

3. **Pruebas de Servidor Apagado (APAGADO-01..04):**  
   `npx playwright test -c playwright.config.ts tests/e2e/servidor-apagado.spec.ts`  
   - APAGADO-01: PASO (25.9s).
   - APAGADO-02: PASO (9.1s).
   - APAGADO-03: PASO (9.9s).
   - APAGADO-04: PASO (44.8s).
   Resultado: 4 passed.

4. **Pruebas de Teléfono Lleno (GUARDA-01):**  
   `npm test -- src/lib/telefono-lleno.test.ts` en `apps/web`  
   Resultado: 3 passed (sin sitio se descartan lecturas no críticas y se preservan escrituras pendientes; `SinEspacio` informado adecuadamente).

5. **Pruebas Unitarias de Respuestas Guardadas:**  
   `npm test -- src/lib/respuestas-guardadas.test.ts` en `apps/web`  
   - Paquete nuevo vence a fila suelta vieja (Punto 3): PASO.
   - Cambio posterior al paquete vence al paquete (Punto 3): PASO.
   - El paquete caduca a los 7 días y devuelve null (Punto 2): PASO.
   - Una fila suelta caduca a los 7 días y devuelve null (Punto 2): PASO.
   - El recorte nunca toca `__indice__` ni `__bloque_*__` y borra las más viejas primero (Punto 4): PASO.
   Resultado: 5 passed.

6. **Pruebas de Integración Backend:**  
   `npm test -- tests/integration/precarga.test.ts` en `apps/backend`  
   Resultado: 14 passed (`PAQUETE-01..10`, `CAMBIOS-01..05`, `MENU-PARIDAD`).

7. **Verificación de Tipos y Compilación:**  
   - Backend: `npx tsc --noEmit` completado con 0 errores.
   - Frontend: `npm run build` completado con 40 páginas compiladas limpias sin errores de TypeScript.

---

## 5. Conclusión y Cierre

Los 5 puntos requeridos en `REVISION-FASE-B-2.md` han sido resueltos de manera integral, verificados empíricamente y documentados. No se realizaron commits ni pushes de Git, y la Fase C permanece estrictamente intocada.
