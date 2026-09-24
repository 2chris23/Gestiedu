# La portada con los dispositivos que se usan solos

## Para revisar

- **Rama:** `nube/portada`
- **Commits:**
  - `ffe65ca` — guion `docs/nube/portada/medir-portada.mjs` que mide FCP, LCP, CLS, bloqueo y peso de la portada (teléfono y escritorio).
  - (este) — borrador del informe con la línea base.
- **Cómo verlo:** `cd apps/web && npm run build && npx next start -p 3000` y abrir http://localhost:3000 (la portada no necesita el backend).
- **En qué punto quedó:** entorno levantado y línea base medida. Aún no se ha tocado la portada.
- **Qué falta:** todo el hero nuevo, textos, pruebas `tests/e2e/portada.spec.ts`, capturas y vídeo.

## Línea base (antes de tocar nada)

`node docs/nube/portada/medir-portada.mjs antes` sobre `next start`, mediana de 3:

| Perfil | FCP | LCP | CLS | Bloqueo | JS | Imágenes | Total |
|---|---|---|---|---|---|---|---|
| Teléfono (390×844, CPU 4×, 4G lenta) | 1136 ms | 1136 ms | 0,000 | 222 ms | 267 KB | 31 KB | 382 KB |
| Escritorio (1366×900) | 140 ms | 140 ms | 0,000 | 0 ms | 275 KB | 120 KB | 485 KB |

Pruebas al empezar:

- `apps/web`: `tsc` limpio; `jest` 48/48 (tras instalar `@testing-library/dom`, que faltaba en el entorno, sin tocar el lock).
- `apps/backend` jest y Playwright: en curso (ver abajo cuando termine).

Arreglos del ENTORNO (no del producto), anotados por si otro chat los necesita:

- Esta máquina no tiene IPv6 y el backend escucha en `::`: se arrancó con un `--require` que cambia `::` por `0.0.0.0` (fuera del repositorio).
- Playwright 1.62 busca `chromium_headless_shell-1234`; aquí hay la 1194. Enlaces simbólicos en `/opt/pw-browsers`.
