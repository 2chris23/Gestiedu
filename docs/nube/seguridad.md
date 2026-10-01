# Seguridad y permisos — informe de la sesión en la nube

Rama: `nube/seguridad` (sale de `nube/base`). Informe para el dueño del liceo:
qué estaba mal, qué le pasaba al liceo, qué se arregló y con qué commit, qué se
probó y qué no.

> **Estado: BORRADOR.** Se va completando y subiendo durante la sesión.

## Para revisar (lo primero que hay que leer)

**En qué punto está:** tercera vuelta. Cerrados los seis huecos que la matriz
dejaba abiertos salvo uno (buscar alumnos, por decidir: §4), y una fuga nueva
(resúmenes de contraseña) encontrada con la prueba `nada-de-mas-en-el-json`.

**Commits de esta rama** (`git log --oneline origin/nube/base..origin/nube/seguridad`):

| Commit | Qué |
|---|---|
| `5894c60` | S-01 · La llave de renovar ya no abre puertas ni cambia de liceo |
| `2674a0c` | S-03 · La asistencia de una sección solo la toca quien la lleva |
| `93bedf7` | S-02 · Inscribir alumnos y asignar materias, solo el administrador |
| `81e5c47` | S-04 · El guía ya no pone notas en materias que no da |
| `d385ba1` | S-05 · Un profesor ya no lista las notas de todo el liceo |
| `4cd9ced` | S-06 · Actividades y observaciones: cada quien lo de sus secciones |
| `11f0ec4` | S-07 · Promedios de una sección, solo su guía y el administrador |
| `c7abee5` | S-08 · Los avisos de cada persona son suyos |
| `60c6a86` | S-09 · Los alumnos de una materia salían con el resumen de su contraseña |
| `34b4e7d` | S-10 · Un profesor cambiaba o borraba horas del horario de otra sección |
| `afc4e16` | S-11 · Clase en vivo: abrir, leer, cambiar y pasar lista, solo quien la da |
| (siguiente) | S-12 · La cabecera del plan (cédula y teléfono del profesor) a cualquiera |

**Cómo probarlo:**

```bash
cd apps/backend
npx jest tests/integration/quien-puede-que.test.ts        # la matriz ruta × rol (10 llamantes)
npx jest tests/integration/nada-de-mas-en-el-json.test.ts # todas las GET × 4 roles: sin contraseñas ni llaves
ESCRIBIR_MATRIZ=1 npx jest tests/integration/quien-puede-que.test.ts   # regenera docs/nube/matriz-de-permisos.md
```

**Qué falta** (en este orden): IDOR de pagos y comprobantes; separación entre
liceos por subdominio/dominio y salas de socket.io; JWT `alg none` / firma
cambiada / caducado (ya hay pruebas en `auditoria-intrusion`, repasar);
recuperar contraseña y enumeración de correos; QR (firmar por otro, reusar,
otra sección); pagos apagados → 403 en todas; inyección en `$queryRaw`;
cabeceras de seguridad medidas; la web (RSC, `__NEXT_DATA__`, `app/api/**`);
investigación (OWASP, LOPNNA) en §5.

## 1. Línea base (antes de tocar nada)

Entorno montado desde cero en la nube: PostgreSQL 16, Redis 7, `npm ci`,
Prisma generado, liceo `instituto-testing` sembrado y migrado.

| Qué | Resultado |
|---|---|
| `npx jest` (servidor, con Redis de verdad) | 859 de 867 en verde. Los 8 rojos, del entorno: 7 de `tenant-mismatch` (a la base `template1` le faltaba `pg_trgm`; con la extensión, 7/7) y LOGO-03, que falla a ratos (pasa sola; ver §4) |
| `npm run typecheck` servidor | limpio |
| `npm run typecheck` web | 2 errores en `GuideHistoryModal.test.tsx` (`screen`/`fireEvent` de `@testing-library/react`: falta `@testing-library/dom`, que `--legacy-peer-deps` no instala). Del entorno, no del producto |
| `npx jest` web | 45/45 pruebas; 1 archivo (el mismo) no carga |

## 2. Hallazgos, por gravedad

Todos medidos con peticiones de verdad (servidor en marcha o `supertest` contra
el servidor completo). Cada uno: prueba que falla → arreglo en el servidor →
prueba en verde → commit.

### S-01 (CRÍTICO) · La llave de renovar abría la puerta, y renovar borraba el liceo del token — `5894c60`

- **Qué le pasaba al liceo.** La llave de «volver a entrar» (7 días; 60 con
  «recordarme») se aceptaba como llave de acceso. Seguía abriendo **después de
  «Cerrar sesión»** (medido: `/api/auth/profile` → 200 con la llave de renovar
  tras el cierre). Y cada llave de acceso que salía de una renovación iba con
  `instituteId: null`, porque en la base de cada liceo esa columna está vacía;
  sin liceo en el token, el guardián `TENANT_MISMATCH` no tenía con qué
  comparar y la cabecera `X-Institute-Slug` elegía la base.
- **Consecuencia medida:** un profesor con la misma cédula en dos liceos (lo
  normal en Venezuela: muchos dan clase en dos planteles) entraba en el liceo B
  con la contraseña del liceo A, 15 minutos después de entrar (o en el acto con
  la llave de renovar). Probado en vivo copiando el liceo de pruebas como
  «liceo-b»: `200` con los datos de B.
- **Arreglo.** Cada llave lleva su tipo (`typ`) y cada comprobación rechaza la
  otra (la de renovar se reconoce también por su `tokenId`, así las ya
  repartidas no se confunden); la renovación pone el liceo de la petición; y
  `authenticate` rechaza con `401 TENANT_MISMATCH` todo token sin liceo o con
  otro. Pruebas `LLAVE-R-01…07` (`la-llave-de-renovar-no-abre-puertas.test.ts`).

### S-02 (ALTO) · Un profesor se hacía dueño de cualquier sección — `93bedf7`

Cualquier profesor podía asignarse una materia en cualquier sección
(`POST /classrooms/:id/subjects`), y meter o sacar alumnos de secciones
(`POST/DELETE /classrooms/:id/students`, sacar con su propia contraseña).
Asignándose una materia pasaba a «impartir» allí: notas, asistencia y datos de
esos alumnos. Ahora es del administrador (control de estudios). La pantalla de
la sección ya no enseña esos botones al profesor.

### S-03 (ALTO) · Asistencia de secciones ajenas — `2674a0c`

El profesor de 1.º B **corregía y borraba** la asistencia de 1.º A y pasaba
lista en bloque en una sección ajena (medido: `DELETE /attendance/:id` → 200).
Alumnos y representantes leían la asistencia completa de cualquier sección por
fecha y el resumen de la sección; un representante leía registros sueltos de
otros alumnos por su id. Un profesor podía apuntar en su sección a un alumno
inscrito en otra. Ahora todo pasa por la sección y por la inscripción.

### S-04 (ALTO) · El guía ponía notas en materias que no da — `81e5c47`

`assertClassroomScope` dejaba al profesor guía todo menos el plan en cualquier
materia de su sección: corregía la nota de Matemática sin darla, daba la clase
en vivo y tocaba actividades de otro profesor. Ahora el guía, en lo que no
imparte, solo pasa asistencia, deja observaciones y mira.

### S-05 (ALTO) · Las notas de todo el liceo, para cualquier profesor — `d385ba1`

`GET /grades`, `/grades/subject/:id`, `/grades/export/:formato` y
`/grades/activity/:id` devolvían notas de cualquier sección a cualquier
profesor. Ahora se filtran por lo que imparte y por sus secciones guía (y la
memoria rápida guarda la lista con su cédula, para no servírsela a otro).

### S-06 (MEDIO) · Actividades y observaciones — `4cd9ced`

El representante veía las actividades de todo el liceo y, al abrir una, las
notas de **todos** los alumnos que la hicieron. Alumnos y representantes de
otra sección pedían las actividades de 1.º A. Un profesor dejaba
observaciones en el expediente de cualquier alumno del liceo. Arreglado; y el
profesor se mide ya por lo que imparte y no por la tabla vieja
`teacherClassroom` (que dejaba fuera al profesor de la clase: 403 al crear).

### La matriz ruta × rol

- **Mapa de rutas** sacado del servidor, no a mano: `docs/nube/mapa-de-rutas.md`
  (286 rutas bajo `/api`), generado por `src/scripts/mapa-de-rutas.ts`.
- **Matriz medida**: `docs/nube/matriz-de-permisos.md`, generada por
  `tests/integration/quien-puede-que.test.ts` (68 casos × 10 llamantes: sin
  sesión, admin, profesor de esa clase, guía que no la da, profesor de otra,
  alumna de la sección, alumno de otra, representante de ella, de otro, y un
  token de otro liceo). Los huecos medidos que siguen abiertos van con
  `it.failing` y se quitan de la lista al cerrarlos.

## 3. Qué se probó y qué no

*(pendiente)*

## 4. Qué queda por decidir

*(pendiente)*

## 5. Investigación y fuentes

*(pendiente)*
