# Trabajo de las sesiones en la nube: índice para revisarlo

Cuatro sesiones trabajaron en paralelo sobre Gestiedu, cada una en su rama y sin
tocar `main` ni `trabajo/*`. Todas parten de `nube/base`, que es una foto de la rama
`trabajo/funciones-pagos-tutores-reemplazos` sin `.github/workflows`.

| Tema | Rama | Informe (en esa rama) | Qué hace |
|---|---|---|---|
| Funcional por rol | `claude/busy-bohr-000kvi` | `docs/nube/funcional.md` | Fallos de funcionamiento, cálculos, concurrencia; funciones que le faltan a un liceo venezolano |
| Seguridad | `nube/seguridad` | `docs/nube/seguridad.md` | Permisos por rol, IDOR, separación entre liceos, autenticación, archivos, XSS, QR |
| Diseño | `nube/diseno` | `docs/nube/diseno.md` + `docs/nube/diseno/` | Centrado, alineación, coherencia y fricción por rol (solo presentación) |
| Portada | `nube/portada` | `docs/nube/portada.md` + `docs/nube/portada/` | La portada `/` con los dispositivos animados |

Cada informe empieza con una sección **«Para revisar»**: los commits con una línea
cada uno, cómo probarlo, en qué punto quedó y qué falta. (La de seguridad se lanzó
antes de pedir esa sección: su informe trae la lista de commits, pero puede no
tener ese apartado.) La sesión funcional no se llama `nube/funcional` porque esa
sesión solo podía subir a su propia rama.

## Cómo revisarlo desde otro chat

```bash
git fetch origin
for r in claude/busy-bohr-000kvi nube/seguridad nube/diseno nube/portada; do
  echo "== $r"; git log --oneline origin/nube/base..origin/$r
done
git show origin/nube/seguridad:docs/nube/seguridad.md     # igual con los demás
git diff --stat origin/nube/base origin/nube/seguridad    # qué archivos tocó cada una
```

Si una rama no existe, esa sesión no llegó a subir nada: pudo cortarse por el
límite de uso. Lo que no se subió se perdió con su máquina.

## Antes de juntarlo con tu rama

- Las cuatro tocan zonas distintas a propósito: servidor y funciones, permisos, pantallas y portada.
  Aun así, `funcional` y `seguridad` pueden coincidir en archivos del servidor. Júntalas de una en una
  y corre `npx jest` y `npm run typecheck` después de cada una.
- Ninguna edita `CLAUDE.md`, `docs/AUDITORIA-FUNCIONAL.md` ni `docs/MAPA_DE_CALCULOS.md`.
  Lo que haya que anotar ahí viene en cada informe.
- Ninguna abrió pull requests.
