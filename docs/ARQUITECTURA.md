# La arquitectura de Gestiedu (19-oct-2026)

Cómo está hecho el sistema hoy, qué se limpió y hacia dónde se ordena. Lo
escribe Claude como programador jefe (CLAUDE.md 0-bis y 0-ter).

## Las piezas

```
apps/backend   Fastify 5 + Prisma 6 + PostgreSQL: la API, las tareas de fondo
apps/web       Next.js 16 + React 19: las pantallas (y la PWA)
apps/movil     Capacitor: la APK, que enseña la misma web
tests/e2e      Playwright: las pruebas de navegador
scripts/       el túnel, el teléfono y las auditorías de diseño
docs/          lo que se decide y se mide
```

## El servidor (`apps/backend/src`)

| Carpeta | Qué va | Regla |
|---|---|---|
| `routes/` | Una por tema: la puerta (ruta, esquema, guardias) | Toda ruta de escritura lleva `authenticate` y su guardia; ninguna sin pantalla que la use |
| `controllers/` | Leer la petición, llamar al servicio y responder | Fino: nada de cálculos aquí (hoy aún los hay, ver abajo) |
| `services/` | La lógica: cálculos, reglas y acceso a la base | Siempre en bloque (sin N+1), con el liceo explícito |
| `plugins/` | Lo que cruza todas las peticiones: cupo, doble envío, avisar cambios, medidor, tope de carga | |
| `middleware/` | Quién eres (`auth`), de qué liceo (`tenant`) y los guardias | |
| `config/` | Base de datos (un cliente por liceo), Redis, JWT y el ámbito del liceo | |
| `jobs/` | Tareas de fondo. Las que recorren todos los liceos corren una vez entre todos (`utils/turno-de-la-tarea.ts`) | |
| `utils/` | Piezas sin estado: fechas, redondeos, cálculos puros | |
| `precarga/` | El mapa de qué lee cada pantalla, para la descarga | |
| `scripts/` | Medir, migrar, respaldar | No corren en el servidor |

**Las cuentas que tienen que dar lo mismo en todas partes** viven en UN sitio:
- `services/cifras-oficiales.service.ts`: el promedio y la asistencia de cada alumno, la cuenta de la boleta (MAPA §0);
- `services/promedios-del-alumno.ts`: el nivel 2, el promedio de una materia en un lapso;
- `services/bulk-averages.service.ts`: lo mismo para toda una sección o un año, en bloque;
- `services/aggregation.service.ts`: la sección, el año y el liceo, encima de lo anterior.

## Las pantallas (`apps/web/src`)

| Carpeta | Qué va |
|---|---|
| `app/` | Las rutas de Next (una carpeta por pantalla) |
| `components/<tema>/` | Las piezas de cada tema (finanzas, clase en vivo, configuración…) |
| `components/ui/` | Las piezas comunes del diseño |
| `hooks/` | `useQuery` de cada dato: así se guarda para verse sin conexión |
| `lib/` | Lógica sin React: la precarga, lo pendiente por enviar, las cuentas copiadas del servidor (`plan-weeks`, `franjas-del-horario`, `instrumentos`) |
| `providers/` | El tiempo real, enviar lo pendiente, la memoria del teléfono |

## Lo que se limpió el 19-oct-2026

Se buscó con evidencia, no a ojo: en cada caso, ninguna importación, ninguna pantalla y ninguna prueba que lo usara.

**El servidor (~13.000 líneas menos):**
- **Las rutas sin pantalla:**
  - `/api/statistics/*`, `/api/reports/*` y `/api/notifications/*` (la de hoy es `/api/avisos`);
  - `/api/teachers/*` (salvo carga y horas, que viven en `personal.routes`);
  - el horario viejo `/api/schedules` (la web usa los bloques);
  - «mis notas» y «mi asistencia»;
  - el historial completo;
  - los paneles extra;
  - el monitoreo viejo;
  - los puertos;
  - la configuración por id;
  - las materias por grado;
  - borrar una revisión.
- **Los servicios que solo usaban esas rutas:** `cycle-statistics`, `reports`, `notifications`, `teachers`, `schedules`, `activities`, `attendance`, `classrooms`, `users` y `email`. Con ellos se fueron los DTO, los tipos sin uso y ~60 funciones y métodos sueltos.
- **Fuera del código:**
  - 60 guiones y registros de una sola vez que había en la raíz del backend;
  - `setup.js` y el script `db:push`, que pedían `db push`, prohibido;
  - los k6;
  - las pruebas viejas de la raíz y de la web;
  - cuatro carpetas de documentos vacías.

**La web (~6.000 líneas menos):** 40 componentes, ganchos y servicios que nadie importaba, como los modales viejos de notas y actividades, las tarjetas de datos, el servicio de autenticación viejo y la copia `.backup`.

**Las pruebas:**
- **Se reescribieron para mirar las pantallas de verdad:** las reglas de riesgo, nota mínima, asistencia, alumno retirado y notas en cero vivían en `/api/statistics`, y ahora se comprueban sobre el resumen de la sección, el del año y la materia.
- **Se quitaron con su ruta:** las que solo probaban que una ruta quitada respondía.

## Lo que se ordenó el 20-oct-2026

**Ningún archivo de código pasa ya de 800 líneas** (había 26; el mayor, 2.186). `TAMAÑO-01` lo exige ahora a todos: la lista de excepciones quedó vacía.

- **El servidor:** los controladores grandes se partieron por tema en carpetas: `controllers/horario/`, `clase-en-vivo/`, `usuarios/`, `pagos/`, `finanzas/`, `ano-escolar/`, `secciones/`, `plan/`, `alumnos/`, `observaciones/`, `superadmin/`. Los servicios: `services/inicio/` (el Inicio de cada rol), `services/promotion/` (configuración académica, confirmar el cierre, estrategias) y `services/pendientes/`.
- **Las pantallas grandes** siguen una misma forma: un gancho con lo que la pantalla sabe y hace (`useClaseEnVivo`, `usePromocion`, `useLaSeccion`, `useFichaDelUsuario`, `useHorarioDelAlumno`, `usePlanDeEvaluacion`) y sus partes como componentes que reciben `c` (lo que devuelve el gancho), con sus tipos.
- **Fuera las rutas viejas** `/api/grades`, `/api/attendance` y `/api/activities` (sin pantalla). Las pruebas que las usaban de atajo pasan por la clase en vivo. Al pasarlas salieron dos fallos de verdad (nota a un alumno de otra sección; estado de asistencia inventado → 500) y, al revisar las cuentas, otros tres (el cuadro general del guía, las tarjetas de la sección y la ficha del profesor daban otra cifra que la boleta; borrar un año con notas de la clase en vivo).

## Lo que queda por ordenar

1. **Módulos por tema en el servidor** (`modules/<tema>/` con ruta, controlador y servicio juntos). Las carpetas por tema de hoy son el primer paso; mover las rutas y los servicios a su lado es lo siguiente, tema por tema y con las pruebas en verde en cada paso.
2. **La tabla vieja `grades`** solo la escriben las semillas (ninguna pantalla); las notas de verdad viven en la clase en vivo (`class_activities.scores`). Las cuentas leen las dos. Decidir si se migra y se quita.
