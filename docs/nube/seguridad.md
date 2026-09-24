# Seguridad y permisos — informe de la sesión en la nube

Rama: `nube/seguridad` (sale de `nube/base`). Informe para el dueño del liceo:
qué estaba mal, qué le pasaba al liceo, qué se arregló y con qué commit, qué se
probó y qué no.

> **Estado: BORRADOR.** Se va completando y subiendo durante la sesión.

## 1. Línea base (antes de tocar nada)

Entorno montado desde cero en la nube: PostgreSQL 16, Redis 7, `npm ci`,
Prisma generado, liceo `instituto-testing` sembrado y migrado.

| Qué | Resultado |
|---|---|
| `npx jest` (servidor, con Redis de verdad) | *en curso* |
| `npm run typecheck` (servidor / web) | *pendiente* |
| `npx jest` (web) | *pendiente* |

## 2. Hallazgos

*(se rellena según se mide)*

## 3. Qué se probó y qué no

*(pendiente)*

## 4. Qué queda por decidir

*(pendiente)*

## 5. Investigación y fuentes

*(pendiente)*
