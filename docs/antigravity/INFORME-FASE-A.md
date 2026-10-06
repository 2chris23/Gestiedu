# Informe Fase A — El aviso «Sin conexión» que parpadea

Fecha: 2026-10-06
Rama: `trabajo/integracion-nube`
Autor: Antigravity
Revisión: Pendiente de Claude

---

## 1. Resumen del problema y solución implementada

### Diagnóstico inicial
Cuando el servidor de pantallas (Next.js, puerto 3000) o sus rutas de autenticación (`/api/auth/*`) fallaban mientras la API de datos (Fastify, puerto 3001) permanecía en línea, el componente `AvisoSinConexion` parpadeaba continuamente.
- La función de sondeo `preguntarAlServidor()` en `apps/web/src/hooks/useConexion.ts` solo realizaba `api.get('/health')` contra la API de datos.
- Como la API de datos respondía con 200, el interceptor de Axios llamaba a `elServidorContesto()`.
- Sin embargo, las peticiones que pasaban por Next.js (`/api/auth/refresh`, `/api/auth/me`) fallaban y llamaban a `elServidorNoContesta()`.
- En `apps/web/src/lib/estado-del-servidor.ts`, cualquier respuesta exitosa cambiaba `contesta` inmediatamente a `true`, eliminando el aviso de inmediato, solo para volver a aparecer tras el siguiente fallo de autenticación.

### Cambios realizados

1. **Comprobación de doble vía en la pregunta periódica (`apps/web/src/hooks/useConexion.ts`):**
   - Se reescribió `preguntarAlServidor()` para evaluar ambos caminos en paralelo:
     - API de datos: `fetch('${API_BASE_URL}/health', { method: 'GET', cache: 'no-store', headers: { 'Cache-Control': 'no-store' } })`.
     - Origen web (Next.js): `fetch('/api/estoy', { method: 'GET', cache: 'no-store', headers: { 'Cache-Control': 'no-store' } })` (endpoint ligero ya existente que responde 204 sin datos y con `no-store`).
   - Solo se llama a `elServidorContesto()` si **ambos** caminos responden satisfactoriamente (`r.ok`). Si cualquiera de los dos falla o se agota el tiempo (timeout seguro de 4 s vía `AbortController`), se llama a `elServidorNoContesta()`.

2. **Histéresis anti-rebote (`apps/web/src/lib/estado-del-servidor.ts`):**
   - Ante cualquier fallo (`elServidorNoContesta()`):
     - Se actualiza la marca de tiempo `ultimoFallo = Date.now()`.
     - Se reinicia el contador de éxitos a `exitosSeguidos = 0`.
     - Se cancela cualquier temporizador de confirmación pendiente.
     - Si estaba en `contesta: true`, pasa a `contesta: false` de inmediato y notifica a los oyentes.
   - Ante una respuesta exitosa (`elServidorContesto()`):
     - Se incrementa `exitosSeguidos++`.
     - Si el servidor ya constaba como contestando (`estado.contesta === true`), solo se actualiza `ultimaRespuesta`.
     - Si el servidor estaba marcado como no contesta (`estado.contesta === false`):
       - Requiere al menos **2 respuestas exitosas seguidas** (`exitosSeguidos >= 2`) **Y** que hayan transcurrido **al menos 10 segundos limpios desde el último fallo** (`ahora - ultimoFallo >= 10_000`).
       - Si ya se acumulan 2 éxitos seguidos pero aún faltan segundos para cumplir los 10 segundos, se programa un temporizador por el tiempo restante (`10_000 - tiempoSinFallos`) para confirmar el regreso al cumplirse la ventana, siempre que no acontezca ningún fallo adicional en ese lapso.

3. **Pruebas unitarias de histéresis (`apps/web/src/lib/estado-del-servidor.test.ts`):**
   - Se añadieron pruebas unitarias con temporizadores simulados de Jest (`jest.useFakeTimers()`) verificando:
     - Un fallo pone `contesta: false` en el acto.
     - 1 sola respuesta buena tras fallo mantiene `contesta: false` incluso tras 10 s.
     - 2 respuestas buenas seguidas requieren 10 s sin fallos para volver a `contesta: true`.
     - Un fallo intermedio resetea la ventana de 10 s y el contador.

4. **Prueba de navegador E2E Playwright (`tests/e2e/servidor-apagado.spec.ts`):**
   - Se añadió la prueba `APAGADO-04`: inicia sesión como administrador, aborta únicamente las rutas `/api/auth/**` mediante `page.route` dejando la API libre en el puerto 3001, recarga la página para desencadenar el fallo de autenticación en Next, y verifica durante 40 segundos que el aviso `[data-aviso="sin-conexion"]:visible` se mantiene visible de forma ininterrumpida.

---

## 2. Archivos modificados

- `apps/web/src/hooks/useConexion.ts`
- `apps/web/src/lib/estado-del-servidor.ts`
- `apps/web/src/lib/estado-del-servidor.test.ts`
- `tests/e2e/servidor-apagado.spec.ts`

---

## 3. Evidencia experimental: Fallo con código previo vs Pase con código nuevo

### A. Prueba E2E APAGADO-04 con el código previo (Fallo comprobado)

Comando ejecutado:
```powershell
npx playwright test tests/e2e/servidor-apagado.spec.ts -g "APAGADO-04"
```

Salida real obtenida:
```text
Running 1 test using 1 worker

  x  1 [chromium] › tests\e2e\servidor-apagado.spec.ts:253:9 › Con el servidor apagado › APAGADO-04: con /api/auth/** abortado y la API arriba, el aviso no parpadea y permanece visible durante 40 s (26.9s)


  1) [chromium] › tests\e2e\servidor-apagado.spec.ts:253:9 › Con el servidor apagado › APAGADO-04: con /api/auth/** abortado y la API arriba, el aviso no parpadea y permanece visible durante 40 s 

    Error: expect(locator).toBeVisible() failed

    Locator: locator('[data-aviso="sin-conexion"]:visible')
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for locator('[data-aviso="sin-conexion"]:visible')


      280 |         const inicio = Date.now();
      281 |         while (Date.now() - inicio < 40_000) {
    > 282 |             await expect(aviso).toBeVisible();
          |                                 ^
      283 |             await page.waitForTimeout(1_000);
      284 |         }
      285 |     });
        at C:\Users\Windows\Cristian\SISTEMA-DE-GESTION-ESCOLAR\tests\e2e\servidor-apagado.spec.ts:282:33

  1 failed
    [chromium] › tests\e2e\servidor-apagado.spec.ts:253:9 › Con el servidor apagado › APAGADO-04: con /api/auth/** abortado y la API arriba, el aviso no parpadea y permanece visible durante 40 s 
```

Motivo del fallo previo: La API de datos en localhost:3001 respondía a `api.get('/health')`, llamando inmediatamente a `elServidorContesto()` sin validar Next.js y sin histéresis, haciendo desaparecer el aviso a los pocos segundos dentro del bucle de 40 segundos.

---

### B. Prueba E2E APAGADO-04 con el código corregido (Pase comprobado)

Comando ejecutado:
```powershell
npx playwright test tests/e2e/servidor-apagado.spec.ts -g "APAGADO-04"
```

Salida real obtenida:
```text
Running 1 test using 1 worker

  ok 1 [chromium] › tests\e2e\servidor-apagado.spec.ts:253:9 › Con el servidor apagado › APAGADO-04: con /api/auth/** abortado y la API arriba, el aviso no parpadea y permanece visible durante 40 s (45.8s)

  1 passed (47.0s)
```

---

## 4. Ejecución de pruebas y validaciones técnicas

### 1. Pruebas unitarias de estado del servidor (`estado-del-servidor.test.ts`)
Comando:
```powershell
npx jest src/lib/estado-del-servidor.test.ts
```

Salida real:
```text
PASS src/lib/estado-del-servidor.test.ts
  ¿Contestó el servidor?
    √ no llegó nada: no contestó (3 ms)
    √ el repartidor dice que detrás no hay nadie: no contestó (1 ms)
    √ el servidor contestó, aunque fuera para decir que no (1 ms)
    √ un error envuelto por un servicio: es la conexión solo si el servidor consta como caído (1 ms)
    anti-rebote (histéresis)
      √ un fallo pone «no contesta» en el acto (3 ms)
      √ una sola respuesta buena tras un fallo NO lo pone en «contesta» (4 ms)
      √ dos respuestas buenas seguidas requieren 10 s sin fallos para volver a «contesta» (2 ms)
      √ un fallo en medio de la ventana reinicia la cuenta y cancela el regreso (1 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        2.337 s, estimated 4 s
Ran all test suites matching src/lib/estado-del-servidor.test.ts.
```

### 2. Verificación de tipos TypeScript en `apps/web`
Comando:
```powershell
npx tsc --noEmit
```

Salida real:
Código de salida 0 (sin errores de tipado).

### 3. Suite completa de Jest en `apps/web`
Comando:
```powershell
npx jest
```

Salida real:
```text
Test Suites: 22 passed, 22 total
Tests:       116 passed, 116 total
Snapshots:   0 total
Time:        12.493 s
Ran all test suites.
```

### 4. Suite completa de E2E `servidor-apagado.spec.ts`
Comando:
```powershell
npx playwright test tests/e2e/servidor-apagado.spec.ts
```

Salida real:
```text
Running 4 tests using 1 worker

  -  1 [chromium] › tests\e2e\servidor-apagado.spec.ts:77:9 › Con el servidor apagado › APAGADO-01: se sigue viendo lo último, se avisa, guardar dice que falta conexión, y al volver se recupera
  -  2 [chromium] › tests\e2e\servidor-apagado.spec.ts:158:9 › Con el servidor apagado › APAGADO-03: una pestaña diferida se ve sin servidor, también una que nunca se abrió (la app se bajó entera)
  ok 3 [chromium] › tests\e2e\servidor-apagado.spec.ts:209:13 › Con el servidor apagado › sin el ayudante (APK de pruebas por http) › APAGADO-02: con la app abierta, el servidor se va y todo sigue a la vista, con el aviso (5.6s)
  ok 4 [chromium] › tests\e2e\servidor-apagado.spec.ts:253:9 › Con el servidor apagado › APAGADO-04: con /api/auth/** abortado y la API arriba, el aviso no parpadea y permanece visible durante 40 s (45.9s)

  2 skipped
  2 passed (53.4s)
```
*(Nota: APAGADO-01 y APAGADO-03 se saltan con `test.skip` de forma esperada al correr contra el servidor de desarrollo, requiriendo compilación previa como indica el archivo; APAGADO-02 y APAGADO-04 corrieron y pasaron al 100%).*

---

## 5. Detención para revisión

Se ha completado exclusivamente la **Fase A**. Siguiendo las instrucciones del encargo, no se ha avanzado a la Fase B y no se ha realizado commit ni push, quedando el trabajo detenido a la espera de la revisión de Claude.
