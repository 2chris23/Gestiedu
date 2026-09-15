---
name: auditoria-gestiedu
description: Protocolo para cerrar una fase de auditoría de Gestiedu — levantar los servidores, correr las pruebas de integración y de navegador, anotar los fallos reales en docs/AUDITORIA-FUNCIONAL.md y recalcular el porcentaje de avance. Úsalo cuando se termine una fase, se pida "cuánto falta", se vaya a auditar un módulo o se pidan las pruebas completas del sistema.
---

# Cerrar una fase de auditoría

## 1. Levantar el sistema (sin tuberías)

```bash
cd apps/backend && npm run dev    # :3001
cd apps/web && npm run dev        # :3000
```

Nunca `npm run dev | head -20`: SIGPIPE mata el proceso y salen decenas de pruebas en
rojo que no tienen nada que ver.

## 2. Correr las dos tandas

```bash
cd apps/backend && npx jest       # integración, base por archivo
npm run test:e2e                  # navegador, contra instituto-testing
```

Un fallo es de tres tipos y hay que decir cuál:

- **del sistema** — se arregla y se anota;
- **de la prueba** (columna o ruta que ya no existe) — se corrige contra el esquema real;
- **del entorno** (servidor caído, tubería, edición en caliente) — no se anota como fallo.

Cuando un fallo aparece en un sitio, busca el mismo patrón en todos los controladores
antes de parchear ese caso. El cuerpo vacío en DELETE afectaba a 29 y se resolvió en un
único punto del servidor.

## 3. Anotar

- `docs/AUDITORIA-FUNCIONAL.md`: qué estaba mal y qué pasaba, en lenguaje del liceo, no
  del código. Si un fallo tocaba cálculos, también `docs/MAPA_DE_CALCULOS.md`.
- Memoria `gestiedu-estado-pendientes.md`: qué quedó abierto.

## 4. Recalcular el porcentaje

Pesos fijos: API cubierta 30, permisos y seguridad 20, exactitud de cálculos 15,
interfaz probada 15, resistencia a fallos 10, rendimiento 5, despliegue 5.

Cada dimensión aporta su peso por la fracción **verificada con una prueba que comprueba
el dato**, no por la que existe. Una acción con prueba que solo mira el código 200 no
cuenta.

## 5. Informar

En español, corto, sin jerga. Primero los fallos que eran del sistema y qué le pasaba al
liceo por culpa de cada uno; después la cobertura nueva; al final la tabla de pesos y
**"X% verificado — falta Y%"** y qué es lo siguiente que más mueve la aguja.
