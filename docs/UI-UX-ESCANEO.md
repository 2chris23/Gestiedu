# Escaneo de UI/UX: ¿sabe la persona qué hace cada cosa? (1 de octubre de 2026)

Cristian pidió «un escaneo a fondo de la UI/UX, que sea más intuitivo el sistema,
que el usuario sepa qué hace cada cosa», con la skill
[`ui-ux-pro-max`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).
La skill ya estaba en `.claude/skills/ui-ux-pro-max`; se actualizó desde
GitHub (versión del 27-09-2026).

## Cómo se hizo

1. **Medido en el DOM** con las reglas de la skill que se pueden comprobar
   (`scripts/reglas-de-claridad.mjs`). Se pasan con
   `npm run movil -- --claridad` y dejan `docs/capturas-movil/claridad.json`:
   las 51 pantallas, los cuatro roles, en un teléfono.
2. **Mirado en las fotos** de cada pantalla (`docs/capturas-movil/`), con
   `references/quick-reference.md` (119 reglas) y `references/pro-rules.md`
   (la lista de entrega) de la skill.
3. **Leído el código** de cada pantalla con un hallazgo.

Lo que ya se medía y está en verde no se repite aquí: contraste (`contraste.spec`),
tamaño del dedo, letra mínima, bandas del teléfono y anchura (`npm run movil`).

## Lo que se encontró y lo que se hizo

Severidad: **alta** (confunde o lleva a un error), **media** (hay que adivinar),
**baja** (se entiende, pero cuesta).

### Altas — arregladas

| Pantalla | Qué pasaba | Regla de la skill | Arreglo |
|---|---|---|---|
| Académico (profesor) | El profesor veía «Nuevo Ciclo» y la papelera de cada ciclo. Al tocar, el servidor decía que no. | `disabled-states`, `error-recovery` | Solo el admin los ve (`useQuienSoy`). |
| Sección y materia (profesor) | El lápiz «Editar horario» abría un editor que el profesor no puede guardar. | `disabled-states` | Solo el admin lo ve. |
| Usuarios (teléfono) | Encima de la columna de nombres se leía «Editar», un texto suelto. | `icon-context` | Era el `sr-only` de los botones de la fila, escapado sin `relative`. |
| Un aula (teléfono) | «1er Año A» salía en tres líneas, una palabra por línea, apretado contra los botones. La flecha de volver no tenía nombre. | `visual-hierarchy`, `aria-labels` | Cabecera que se acomoda; «Volver a Aulas y secciones». |
| Clase en vivo (teléfono) | Junto a «Editar» había un «+» solo, sin decir qué añadía. | `hover-vs-tap`, `gesture-alternative` | «Añadir bloque» con texto también en el teléfono. |

### Medias — arregladas

| Pantalla | Qué pasaba | Arreglo |
|---|---|---|
| Horario en vivo (todos) | «Hoy: 0 · Próx: 0» en cada clase: había que saber el código. | «0 para hoy · 0 para después», con su globo en el ordenador. |
| Inicio del admin | «En riesgo · Materias < 10»: cifra críptica, y el 10 es del liceo, no fijo. | «Alumnos con materias reprobadas». |
| Ciclo | «Gestión por Niveles» no decía qué había dentro. «Todo el ciclo» suelto no decía qué filtraba. | «Secciones por año», con la línea «Toca un año…», y «Ver: Todo el ciclo». |
| Configuración | Nueve pestañas con solo un nombre; en el teléfono, un montón desordenado. Había que abrirlas una a una para encontrar la nota mínima. | Una tarjeta por apartado, con lo que tiene dentro («Notas, lapsos, horario y fin de año»). |
| Consejo de sección | «Lo tratado» y «Acuerdo» eran solo texto de muestra: al escribir, no se sabía cuál era cuál. | Etiqueta visible encima de cada casilla. |
| Aulas | La papelera gris de un aula con alumnos no decía qué hacer; el «¿Eliminar aula?» no decía qué pasaba. | «Muévelos a otra sección antes de eliminarla»; la confirmación dice que queda copia en la papelera. Botones de 44 px con nombre. |
| Todo el sistema | «Instituto» en unas pantallas y «liceo» en otras; «año académico» y «ciclo escolar». | «Liceo» y «ciclo escolar» en Configuración, Aulas, Académico y la ficha. |
| Clase en vivo · Plan de evaluación | Un flujo de varios pasos sin explicación a mano. | Botón **«¿Cómo funciona?»** (`AyudaDeLaPantalla`): los pasos en orden, siempre en el mismo sitio. |
| Instrumentos (hoja) | «Sin instrumento armado en el sistema.» | «Sin instrumento todavía: se arma en el plan de evaluación, en esta evaluación.» |

### Bajas — anotadas para después

- **Usuarios**: el estado es un punto verde (con `aria-label`), sin texto a la
  vista (`color-not-only`). En el teléfono no cabe la palabra; se podría poner
  solo cuando no está activo.
- **Ficha y horarios**: el tema de la semana sale cortado («Semana 6:…»); al
  tocar la clase se ve entero, pero no hay globo en el teléfono
  (`truncation-strategy`).
- **Sección**: tres botones llenos a la vista («Cambiar», «Hoy», «Nuevo
  Estudiante»); «Hoy» es una pestaña, no una acción (`primary-action`).
- **Promoción**: «Estrategia automática» (cuatro botones) sin una línea de qué
  hace cada una.
- **Hojas de papel** (carnets, plan impreso, resumen del comedor): sin título
  en pantalla; es a propósito, son la hoja tal cual se imprime.
- **Pagos**: nombres cortados sin globo. Se rehace entera en esta tanda
  (Finanzas, como calendario).

## Lo medido, antes y después

`npm run movil -- --claridad`, pantallas con cada falta:

| Falta | Antes | Después | Qué queda |
|---|---|---|---|
| sin-nombre | 1 | 0 | — |
| sin-etiqueta | 2 | 1 | Un desplegable de Configuración (la entidad federal), con su etiqueta encima pero sin `for`. |
| cortado | 2 | 1 | El tema de la semana en la clase en vivo. |
| solo-icono | 15 | 14 | Iconos evidentes (papelera, lápiz, flechas, descargar); ver abajo. |
| para-que | 7 | 8 | Las hojas de papel (sin título a propósito), la ficha y la clase (su cabecera ya lo dice), y «Fin del año», medido mientras cargaba. |
| vacio-mudo | 4 | 4 | Falsos avisos: «Sin cursar o sin cerrar» es un estado, no una lista vacía. |
| muchos-primarios | 3 | 3 | Ficha y sección: «Hoy» es una pestaña llena, no una acción. |

Las seis reglas del teléfono, después de todo esto: 51 pantallas, 0 con algo
que arreglar (`npm run movil -- --exigir`).

`solo-icono` no es un fallo por sí mismo: la papelera, el lápiz, el ojo y las
flechas se entienden sin texto (`components/ui/boton-icono.tsx`). Cuenta los
botones que en el teléfono no tienen globo para que se revisen; los que no eran
evidentes («+», «Asistió…») se arreglaron.
