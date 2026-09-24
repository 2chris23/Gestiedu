# Diseño: centrado, alineación, coherencia e intuición

## Para revisar

- **Rama:** `nube/diseno` (desde `origin/nube/base`).
- **Commits:** (se irán añadiendo)
  - borrador del informe y línea base.
- **Cómo probarlo:** ver «Cómo se probó» (abajo).
- **En qué punto quedó:** montando el entorno y midiendo la línea base.
- **Qué falta / qué queda por decidir:** todo; ver secciones abajo.

## Línea base (antes de tocar nada)

- `apps/web`: `npx jest` → 48/48 en 9 archivos. `npm run typecheck` → 0 errores.
- `apps/backend`: en curso.
- Navegador (Playwright): en curso.

### Notas del entorno (no son del producto)

- El contenedor no tiene IPv6 y el backend escucha en `'::'`: se levantó con un
  parche de entorno (`NODE_OPTIONS=--require ipv4.cjs`, fuera del repositorio)
  que cambia `'::'` por `'0.0.0.0'`. No se tocó `apps/backend`.
- `@testing-library/react` 16 necesita `@testing-library/dom` como dependencia
  par, y `npm ci --legacy-peer-deps` no la instala: `next build` falla en el
  chequeo de tipos de `GuideHistoryModal.test.tsx`. Se instaló con `--no-save`.
  **Queda por decidir** si se añade `@testing-library/dom` a `devDependencies`
  de `apps/web` (lo haría la sesión de funcionamiento o el dueño).
