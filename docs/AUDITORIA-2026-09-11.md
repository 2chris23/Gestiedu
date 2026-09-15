# Auditoría del sistema — 11 de septiembre de 2026

Objetivo evaluado: **poder alojar Gestiedu en un servicio, crear liceos desde el panel de superadmin en 3 minutos y no volver a tocar código**, aguantando 200 liceos con miles de usuarios, rápido, sin perder datos, sin errores en pantalla y con los liceos aislados entre sí.

Todo lo de abajo está comprobado ejecutando el código, no leyéndolo por encima.

> **Estado al 11 de septiembre por la tarde.** Ya corregido de esta lista:
> los 55 errores de tipos (backend y frontend compilan), el Dockerfile y el
> `docker-compose.prod.yml` de producción, el despliegue automático con
> migración de todos los liceos, el límite de conexiones con PgBouncer y la
> pantalla de migraciones en el panel de superadmin. Ver
> [DESPLIEGUE.md](DESPLIEGUE.md). Sigue pendiente todo lo demás.

## Nota global: 6 / 10

| Área | Nota | Por qué |
|---|---|---|
| Funcionalidad y alcance | 8 | 70.000 líneas de backend, 34 modelos, 87 índices. El dominio escolar está muy completo. |
| Aislamiento entre liceos | 8 | Una base de datos por liceo y el token manda sobre cabeceras y subdominio. |
| Seguridad general | 5 | Sin freno a la fuerza bruta y se pueden averiguar correos existentes. |
| Rendimiento a escala | 4 | Prueba de carga real: 95% de las peticiones a ~10 s con 1254 usuarios. |
| Exactitud de los datos | 6 | Un bug confirmado en el promedio de sección; 10 tests en rojo. |
| **Listo para producción** | **3** | **El frontend no compila, el contenedor arranca en modo desarrollo y el despliegue es un `echo`.** |
| Pruebas | 6 | 238 tests de backend, pero solo 2 de frontend y 16 de navegador. |

La base es buena. Lo que falta no es rehacer el sistema: es la capa de "producto desplegable".

---

## 1. Lo que impide desplegarlo hoy

### 1.1 El frontend no compila
`npm run build` en `apps/web` falla con **16 errores de tipos** en 4 archivos (`AcademicOverview.tsx`, `SubjectScheduleSection.tsx`, `AssignSubjectTeacherModal.tsx`, `LiveClassObservationModal.tsx`). El backend tiene otros **18**. Ningún servicio de alojamiento acepta un frontend que no compila.

### 1.2 El contenedor del backend arranca en modo desarrollo
`docker/backend/Dockerfile` termina en `CMD ["npm", "run", "dev"]`, sin compilar y sin `NODE_ENV=production`. Además `npx prisma generate || true` esconde el fallo si la generación falla.

### 1.3 `docker-compose.prod.yml` no es de producción
- PostgreSQL **sin volumen**: al reiniciar el contenedor se pierden los datos de todos los liceos.
- Usa `.env.example` como archivo de variables, es decir, valores de ejemplo.
- `web` y `nginx` piden el mismo puerto 80.

### 1.4 El despliegue automático no despliega
`.github/workflows/deploy-production.yml` entero es `run: echo "Desplegando a Producción..."`.

### 1.5 No hay forma automática de migrar los 200 liceos
Cuando añadas una función que cambie la base de datos, cada liceo necesita su migración. Hoy existe `push-all-dbs.ts`, que usa `db push` (fuerza el esquema; puede borrar columnas con datos). El alta de un liceo nuevo sí hace lo correcto (`prisma migrate deploy`). Falta el paso de "al publicar una versión, migrar todos los liceos existentes", con registro de cuáles fueron bien y reintento de los que fallen.

### 1.6 Sin respaldos
No hay copia de seguridad programada ni prueba de restauración. Con una base por liceo, esto es lo que separa un incidente de una catástrofe.

---

## 2. Escala: qué se rompe con muchos liceos y usuarios

### 2.1 Conexiones a la base de datos (lo más urgente)
`apps/backend/src/config/database.ts` guarda hasta **50 clientes Prisma vivos**, uno por liceo, y la URL de conexión no lleva `connection_limit`. Prisma abre por defecto varias conexiones por cliente, así que 50 liceos activos pueden pedir varios cientos de conexiones a un PostgreSQL que normalmente admite 100. Solución: `connection_limit=2` en la URL de cada liceo y un **PgBouncer** delante.

### 2.2 Prueba de carga real
`load-tests/reports/basic-5k-summary.json`, con 1254 usuarios simultáneos:
- mediana **4,6 s**, percentil 95 **10 s** (el tope del test)
- **5,3%** de peticiones fallidas
- 47.737 errores de login
- aciertos de caché: **0%**

Hoy no aguanta un liceo grande en hora punta, y menos 200.

### 2.3 Consultas sin límite
De unas **200 llamadas `findMany`, solo 21 tienen `take`**. Muchas listas traen la tabla entera. Con 5.000 estudiantes eso es lento y consume mucha memoria. Falta además un tope global de paginación en toda la API.

### 2.4 Archivos subidos en el disco del servidor
`upload.middleware.ts` usa `multer.diskStorage`. En un servicio de alojamiento moderno el disco es temporal: **las fotos y documentos desaparecen al volver a desplegar**, y con dos servidores cada uno ve archivos distintos. Hay que mover esto a S3, R2 o similar.

### 2.5 Tiempo real limitado a un solo servidor
Socket.io no tiene adaptador de Redis. Con más de un proceso, un mensaje enviado por el servidor A no llega a los usuarios conectados al servidor B.

---

## 3. Seguridad

**Bien:**
- El aislamiento entre liceos está bien resuelto: el `instituteId` del token manda, y si la cabecera, el subdominio o el dominio apuntan a otro liceo, la petición se rechaza con 401 (`tenant.middleware.ts`). Si no se puede resolver el liceo, la petición se corta en vez de continuar.
- Los secretos se validan al arrancar (mínimo 32 caracteres) y no hay claves escritas en el código.
- Contraseñas con bcrypt (coste 12). Los tests de sanitización e inyección pasan.

> **CORRECCIÓN (12 de septiembre).** Los dos primeros puntos de esta lista
> estaban MAL. Los deduje de que fallaban unos tests, en vez de medir el
> comportamiento real. Medido después, ejecutando el sistema:
>
> - **Sí hay freno a la fuerza bruta:** al intento 11 responde 429 con
>   `Retry-After` (10 intentos por minuto y por IP+correo, en
>   `auth.middleware.ts`). Los tests fallaban porque esperaban 400 donde el
>   sistema devuelve 401.
> - **No se filtra qué correos existen:** contraseña incorrecta y correo
>   inexistente devuelven exactamente lo mismo (401 y el mismo mensaje).

**Por corregir:**
1. **Sin bloqueo de cuenta** tras varios fallos repetidos en el tiempo, ni registro de intentos para detectar ataques.
2. **Sin segundo factor** para administradores y superadmin.

Para llegar al nivel que pides ("tan difícil como entrar en otra cuenta de Facebook") faltan sobre todo esos dos.

---

## 4. Exactitud de lo que ve el usuario

10 tests en rojo, y no son ruido:

| Qué falla | Efecto real |
|---|---|
| Promedio de sección ignora las notas de Clase en Vivo | Un profesor pone 17 y el promedio de la sección muestra 0. **Confirmado.** |
| Nota del plan + nota suelta no se combinan | Debería salir 16 y sale 18. |
| Página de promoción (3 tests) | Destinos sin prellenar y el botón Confirmar no se bloquea como debe. |
| Semana de actividades | Una actividad programada no se marca como "hoy" el día correcto. |
| Login: distinto error según el caso | Ver seguridad, punto 2. |

Añadido: si dos personas guardan a la vez, la última pisa a la otra sin avisar.

**Cobertura:** 238 tests de backend está bien. Pero **2 tests de frontend y 16 de navegador** es poco para tu exigencia de que cada botón haga exactamente lo que dice. Los flujos críticos (notas, asistencia, promoción, horarios, eventos) merecen pruebas de navegador.

---

## 5. Plan de trabajo propuesto, en orden

**Bloque 1 — Que se pueda desplegar**
1. Arreglar los 34 errores de tipos (16 web + 18 backend) y dejar la compilación en verde.
2. Dockerfile de producción de verdad: compilar, `NODE_ENV=production`, sin `|| true`.
3. Infraestructura real: un `docker-compose` correcto (volumen para PostgreSQL, variables reales, puertos sin choque) o, mejor para ti, un servicio gestionado.
4. Despliegue automático que despliegue, y **migración de todos los liceos en cada versión**, con registro y reintento. Retirar `db push`.
5. Respaldos automáticos por liceo y una prueba de restauración.

**Bloque 2 — Que aguante (200 liceos)**
6. `connection_limit` por liceo y PgBouncer.
7. Archivos a S3/R2.
8. Adaptador de Redis para Socket.io.
9. Tope de paginación y `take` en las listas grandes.
10. Repetir la prueba de carga con un objetivo fijo (por ejemplo, percentil 95 por debajo de 600 ms).

**Bloque 3 — Seguridad**
11. Freno de fuerza bruta y bloqueo temporal de cuenta.
12. Misma respuesta para contraseña incorrecta y correo inexistente.
13. Segundo factor para administradores y superadmin.

**Bloque 4 — Exactitud**
14. Promedio de sección con notas de Clase en Vivo.
15. Los otros 9 tests en rojo.
16. Aviso al guardar cuando otra persona ya guardó.
17. Pruebas de navegador de los flujos críticos.

---

## 6. Decisión que conviene tomar pronto

Con una base de datos por liceo, 200 liceos son 200 bases. Eso encarece o directamente no cabe en varios servicios gestionados, y hace más lenta cada migración. Las dos salidas:

- **Mantener una base por liceo** (mejor aislamiento, que es tu prioridad) sobre un PostgreSQL propio con PgBouncer, aceptando el trabajo de migrar en lote.
- **Pasar a un esquema por liceo** dentro de una sola base: más barato y más fácil de migrar, con aislamiento algo menor.

Recomendación: mantener una base por liceo, que ya está construida y probada, y resolver el coste con PgBouncer y migración en lote. Cambiar de modelo ahora sería rehacer la parte más delicada del sistema.
