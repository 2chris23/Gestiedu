# Despliegue y escalado

Cómo se publica Gestiedu y por qué está montado así. La idea de fondo: **crear un
liceo y publicar una versión no deben requerir tocar código ni entrar al
servidor.**

## 1. Qué corre en producción

| Servicio | Para qué |
|---|---|
| `postgres` | Una base de datos por liceo, más la base de la plataforma (liceos, superadmins, planes). |
| `pgbouncer` | Reparte las conexiones. Sin él, cada liceo abre su propio grupo de conexiones y PostgreSQL se queda sin cupo. |
| `redis` | Caché de sesiones y de datos del liceo. |
| `migrator` | Se ejecuta una vez en cada despliegue: migra la plataforma y luego **todos** los liceos. Si falla, el backend no arranca. |
| `backend` | La API (Fastify). |
| `web` | El frontend (Next.js). |
| `nginx` | Lo único que se expone a internet. |

Todo está en `docker-compose.prod.yml`.

## 2. Primera instalación

```bash
cp .env.production.example .env.production
# rellena contraseñas y secretos (mínimo 32 caracteres los JWT)
docker compose -f docker-compose.prod.yml up -d --build
```

El servicio `migrator` crea el esquema de la plataforma. A partir de ahí, los
liceos se crean **desde el panel de superadmin**: cada alta crea su base de
datos, le aplica las migraciones y crea su usuario administrador.

**La plataforma tiene sus propias migraciones** (`src/prisma/plataforma/`),
aparte de las de los liceos, y las aplica `dist/scripts/migrar-plataforma.js`
(`npm run migrate:plataforma` en desarrollo). Antes su esquema estaba en la
misma carpeta que el de los liceos, y `prisma migrate deploy` le aplicaba las
migraciones de los liceos: en un servidor nuevo la base de la plataforma se
quedaba sin la tabla de liceos y el sistema no arrancaba. Una base de
plataforma hecha a mano (`db push`) se apunta como migrada solo si es igual al
esquema; si no, el migrador se para y enseña la diferencia (`PLAT-01…04`).

## 3. Publicar una versión nueva

Al empujar a la rama `production`, el flujo de GitHub Actions
(`.github/workflows/deploy-production.yml`):

1. comprueba que el backend y el frontend compilan;
2. reconstruye las imágenes en el servidor;
3. ejecuta el `migrator`: migraciones de la plataforma y de **cada liceo**;
4. comprueba que el backend responde y que ningún liceo se quedó atrás.

Si un liceo falla al migrar, el despliegue se detiene: es preferible a dejar
liceos con una base vieja frente a un código nuevo.

**Una versión nueva de la APK** no va por aquí: se compila con
`npm run publicar -- --firmada` en `apps/movil` y sus dos archivos
(`<paquete>.apk` y `<paquete>.json`) se copian a la carpeta `apks/` del
servidor, junto a `docker-compose.prod.yml` (montada en `/app/apks`,
`APP_MOVIL_DIR`). No hace falta reiniciar nada: la próxima vez que alguien
abra la app, le sale «Hay una versión nueva». Ver `docs/APP-MOVIL.md`.

## 4. Cuando un liceo se queda atrás

Entra al panel de superadmin → **Migraciones**. Ahí se ve, liceo por liceo,
cuántas migraciones tiene aplicadas y cuáles le faltan, con un botón para
reintentar uno o todos.

Desde la consola, lo mismo:

```bash
npm run migrate:tenants:status   # en qué versión está cada liceo
npm run migrate:tenants          # aplicar lo que falte
```

> El script antiguo `push-all-dbs` está retirado: usaba `prisma db push
> --accept-data-loss`, que fuerza el esquema y **puede borrar columnas con
> datos**. Ahora se usa `prisma migrate deploy`, que aplica solo lo que falta y
> deja constancia en cada base.

## 5. Conexiones: lo que permite escalar

Con una base por liceo, el límite no es el número de bases sino el de
**conexiones**. Dos variables lo controlan (`src/config/tenant-db-url.ts`):

| Variable | Qué hace | Recomendado |
|---|---|---|
| `TENANT_CONNECTION_LIMIT` | Conexiones que abre el cliente de cada liceo. | Depende: ver abajo |
| `PGBOUNCER_HOST` / `PGBOUNCER_PORT` | Repartidor delante de PostgreSQL. Vacío = conexión directa. | `pgbouncer` / `6432` |

Con 50 liceos activos y sin límite, se superaban las 100 conexiones que PostgreSQL
admite por defecto. Con límite 2 y PgBouncer en modo transacción, esos mismos 50
liceos comparten unas 20 conexiones reales.

### De dónde sale el 2, y cuánto cuesta

**La cuenta.** Todas las bases de los liceos viven en el mismo servidor, y el
máximo de conexiones es del servidor entero:

```
conexiones en el peor caso = liceos guardados en memoria (50) × este número
50 × 2 = 100 → justo el máximo de fábrica de PostgreSQL
```

Por eso es 2. Y ojo: PostgreSQL reserva 3 plazas para el superusuario, así que
en realidad da **97**, no 100. Ni el 2 cabe del todo si los 50 liceos están
llenos a la vez. El servidor hace esta cuenta al arrancar y lo dice en el
registro; no corta el arranque.

**Lo que cuesta.** Aquí hubo escrita mucho tiempo una tabla que decía que el 2
costaba **2,6×** y que convenía subirlo a 25. Al volver a medirlo **no se
reprodujo**. Estos son los números de ahora, reproducibles con
`npm run medir:pozo`:

*Solo la base de datos* (200 consultas a la vez, sin servidor de por medio; base
del liceo de carga, 15.000 personas; tres pasadas):

| `TENANT_CONNECTION_LIMIT` | Tiempo | |
|---|---|---|
| 2 | 103–204 ms | |
| 5 | 55–56 ms | ~2× más rápido |
| 10 | 41–55 ms | **el mejor** |
| 25 | 249–270 ms | **peor que el 2** |

El 25 va peor que el 2. Son más conexiones que núcleos tiene la máquina, y lo
que se gana esperando menos se pierde peleándose por el procesador.

*Por la API, que es lo que nota una persona* (50 a la vez, 3 llamadas cada una,
la pantalla más pesada):

| Situación | p50 | Peticiones/s |
|---|---|---|
| pozo 2 | 536 ms | 88 |
| pozo 25 | 742 ms | 68 |

**Por la API el pozo no se nota.** Con una petición completa el cuello de botella
no es el pozo: es el trabajo de responderla.

**Qué poner, entonces.**

| Situación | Qué poner |
|---|---|
| Lo normal | `TENANT_CONNECTION_LIMIT=2` — cabe con 50 liceos y por la API no se nota la diferencia |
| Pocos liceos y se quiere el punto bueno de la base | `5` |
| Más de 10 liceos | Levantar **PgBouncer**, y entonces el número deja de importar |
| Nunca | `25` — mide peor que el 2 en las dos mediciones |

La fórmula, si hay que hacerla a mano:

```
TENANT_CONNECTION_LIMIT = (max_connections − 3) ÷ liceos que estarán activos a la vez
```

**No hace falta acertar a ciegas:** el servidor comprueba la cuenta al arrancar y
escribe en el registro si no cabe, con el número que sí cabría. Lo vigilan las
pruebas CONN-01 a CONN-09.

**Las migraciones nunca pasan por PgBouncer.** Prisma Migrate necesita bloqueos
que el modo transacción no mantiene, así que el código pide la conexión en modo
`direct` para migrar y en modo `runtime` para todo lo demás.

### PgBouncer, probado de verdad

Durante mucho tiempo aquí ponía que el código «estaba preparado» para PgBouncer.
Ya no hace falta creerlo: se levanta y se comprueba con

```bash
PGBOUNCER_HOST=localhost PGBOUNCER_PORT=6432 npm run probar:pgbouncer
```

Trece comprobaciones: que la dirección normal va al repartidor y lleva
`pgbouncer=true`, que la de las migraciones **no** pasa por él, y que leer,
escribir, una consulta cruda y una transacción entera funcionan a través de él.
La cabecera de `src/scripts/probar-pgbouncer.ts` trae el `docker run` para
levantarlo suelto, sin montar el despliegue completo.

El número que lo justifica, medido con diez liceos abiertos a la vez y tope 2:

```
sin repartidor:   20 conexiones reales de PostgreSQL
con repartidor:    3 conexiones reales de PostgreSQL
```

### 200 liceos, y más de un proceso

Lo de arriba se escribió para 50 liceos. Para 200, lo que cambió (septiembre
2026):

- **El proceso guarda hasta 250 liceos abiertos con PgBouncer** (50 sin él),
  configurable con `CLIENTES_DE_LICEO`. Antes eran 50 siempre: con 200 liceos,
  cada petición de uno que no estuviera en la lista tenía que abrir su conexión
  mientras la persona esperaba. Y veinte peticiones a la vez de un liceo nuevo
  abrían veinte conexiones (ahora una: `CONN-10`).
- **PgBouncer**, en `docker-compose.prod.yml`: `DEFAULT_POOL_SIZE=5` y
  `MAX_DB_CONNECTIONS=5` por base, `MAX_USER_CONNECTIONS=160` en total (por
  debajo de las 200 de PostgreSQL) y `TENANT_CONNECTION_LIMIT=5`.
- **Varios procesos del servidor de datos:**

  ```bash
  docker compose -f docker-compose.prod.yml up -d --scale backend=3
  docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
  ```

  El segundo comando hace falta porque nginx averigua cuántos procesos hay al
  arrancar. Lo que antes vivía en la memoria de cada proceso y se rompía con
  varios ya no está ahí: el cupo de peticiones y el freno del doble clic van a
  Redis (`CUPO-01…04`, `DOBLE-01…04`), y los logos a la base de la plataforma
  (`LOGO-01…05`). nginx manda la API al proceso menos ocupado y el tiempo real
  siempre al mismo proceso por dirección (ver `docker/nginx/nginx.conf`).

### El puerto, cuando lo asigna el hospedaje

`PORT` se lee del archivo `.env`, **no** del entorno: esta máquina tenía un
`PORT=3000` suelto en las variables del usuario y el backend arrancó encima de la
web. Para los servicios que asignan el puerto por variable hay una propia y
explícita, que nadie tiene suelta por accidente:

```bash
PUERTO_DEL_HOST=8080   # manda sobre el PORT del archivo
```

## 5-bis. El cifrado: sin esto no entra nadie

**Esto hay que hacerlo antes del primer despliegue.** No es opcional y no es
"para más adelante".

### Por qué el sistema no funciona sin HTTPS

En producción las llaves de sesión se guardan marcadas `Secure`, que significa
*"navegador, no mandes esto por conexión sin cifrar"*. Es lo correcto: sin esa
marca, la llave de cualquiera que use el wifi del liceo viaja a la vista.

La consecuencia práctica: **si el sitio va por HTTP, nadie puede entrar**. No es
que vaya inseguro; es que el navegador se niega a mandar la llave y la pantalla
de entrar no pasa de ahí, sin decir por qué.

### Lo que estaba mal

El `docker/nginx/nginx.conf` era un esqueleto: escuchaba **solo en el puerto
80**, sin cifrado. El `docker-compose.prod.yml` abría el 443 y montaba los
certificados, pero nginx **nunca los usaba**: no había ni una línea
`ssl_certificate`. Le faltaban además dos cosas que rompen cosas concretas:

| Faltaba | Qué se rompía |
|---|---|
| `listen 443 ssl` + certificados | Nadie podía entrar (llaves `Secure`) |
| `Upgrade` / `Connection` | El tiempo real se caía a preguntar por HTTP: más gasto y más tarde |
| `X-Forwarded-For` | Las 200 personas del liceo parecían una sola dirección y compartían cupo |

Ya está corregido en `docker/nginx/nginx.conf`, con el motivo de cada línea
escrito al lado.

### Conseguir los certificados

Con el dominio ya apuntando a la máquina:

```bash
mkdir -p docker/nginx/certs docker/nginx/certbot
```

```bash
docker run --rm -p 80:80 -v "$PWD/docker/nginx/certs:/etc/letsencrypt/live-out" -v "$PWD/docker/nginx/certbot:/var/www/certbot" certbot/certbot certonly --standalone -d TU-DOMINIO --email TU-CORREO --agree-tos --no-eff-email
```

nginx espera exactamente estos dos nombres en `docker/nginx/certs/`:

- `fullchain.pem`
- `privkey.pem`

**Si no están, nginx no arranca.** Es a propósito: antes arrancaba sin cifrado y
el fallo aparecía como "no puedo entrar y no sé por qué". Ahora falla al
desplegar, diciendo qué falta.

### Renovarlos

Caducan cada 90 días. La renovación usa `docker/nginx/certbot`, que ya está
montado, así que **no hay que tirar el sitio** para renovar:

```bash
docker run --rm -v "$PWD/docker/nginx/certs:/etc/letsencrypt" -v "$PWD/docker/nginx/certbot:/var/www/certbot" certbot/certbot renew --webroot -w /var/www/certbot
```

```bash
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

Ponlo en el calendario **cada dos meses**. Un certificado caducado deja el liceo
entero fuera, y el aviso llega por correo a una dirección que igual nadie mira.

### De quién se fía el servidor cuando le dicen desde dónde llaman

La dirección de quien llama la escribe **quien llama**, en una cabecera. El
servidor la usa para contar intentos de entrar, así que si se fía de cualquiera,
esos límites se esquivan cambiando un número (se comprobó: quince contraseñas
desde quince direcciones inventadas, las quince pasaron).

Por defecto el servidor solo acepta esa cabecera **de direcciones internas**, que
es donde vive nginx. No hay que configurar nada si se despliega con este
`docker-compose`.

`TRUSTED_PROXIES` lo cambia si hace falta:

| Valor | Qué hace |
|---|---|
| *(sin poner)* | Solo de dentro. **Lo normal** |
| `false` | De nadie. Correcto si el servidor está expuesto sin nada delante |
| `10.1.2.3,10.1.2.4` | Solo de esas |
| `true` | De cualquiera. **Deja los límites por dirección en nada** |

## 6. Elegir proveedor

Lo importante: **alquila un PostgreSQL normal, no un servicio que cobre por base
de datos o por proyecto.** Con una base por liceo, 200 bases dentro de un mismo
servidor cuestan lo mismo que una; en un servicio que cobra por proyecto, cuestan
200 veces más.

**La recomendación (septiembre 2026):** un servidor alquilado (VPS), por
ejemplo Hetzner en su centro de EE. UU. Este, con este `docker-compose`. El
disco no se borra al reiniciar, es lo más barato por liceo y es lo que ya
espera todo lo de aquí. Para los primeros 2 o 3 liceos basta una máquina. Al
crecer: otra para PostgreSQL y más procesos del servidor de datos (§5, «200
liceos, y más de un proceso»), sin cambiar código. La copia de los respaldos
fuera del servidor, a Cloudflare R2 (§8), que no cobra por descargar.

## 7. El modo de la aplicación: comprobarlo, no suponerlo

La aplicación carga los archivos `.env` **pisando** lo que venga del sistema. Es a
propósito, para que una variable vieja de una consola no rompa el desarrollo. Pero
con `NODE_ENV` eso era una trampa: al desplegar se pone `NODE_ENV=production` en el
servidor y, si quedaba un `.env` diciendo `development`, **ganaba el archivo**.

La aplicación arrancaba igual, respondía igual, y estaba en modo desarrollo:
registrando en el log **cada consulta a la base**, con los límites de peticiones
flojos y contando los errores de más. Nada de eso se nota mirando la pantalla.

Corregido: `NODE_ENV` del entorno manda sobre el del archivo; el resto sigue igual.

**Cómo comprobarlo después de cada despliegue**, que cuesta un segundo:

```bash
curl -s https://<tu-dominio>/health
```

Tiene que decir `"environment":"production"`. Si dice `development`, el servidor
está gastando el doble y guardando en el log cosas que no debería.

---

## 8. Respaldos: uno por liceo, y probados

Con una base por liceo, respaldar "el sistema" no sirve: si el liceo Bolívar
borra por error un año escolar entero, restaurar toda la plataforma pisaría el
trabajo de los otros 199. Cada liceo se guarda en su propio archivo y se puede
devolver solo.

```bash
cd apps/backend
npm run backup:tenants                          # guarda todos y borra los viejos
npm run restore:tenant -- --slug=liceo-bolivar  # dice qué haría, sin hacerlo
npm run restore:tenant -- --slug=liceo-bolivar --confirmar
```

Restaurar **borra lo que el liceo tenga ahora**: todo lo trabajado desde ese
respaldo se pierde. Por eso, sin `--confirmar`, el comando solo explica qué haría.

**La base de la plataforma también se guarda**, cada noche y la primera, en
`_plataforma__<fecha>.dump` (ningún liceo puede llamarse así). Es la que dice
qué base es de qué liceo y con qué llave se entra: sin ella, los archivos de los
liceos no se pueden volver a enganchar. Antes no se guardaba (`RESP-07` la
guarda y la devuelve). Si se pierde el servidor entero, se restaura primero la
plataforma y luego cada liceo:

```bash
pg_restore --clean --if-exists --no-owner --dbname=gestion_escolar_platform backups/_plataforma__<fecha>.dump
```

### Configuración

| Variable | Para qué | Por defecto |
|---|---|---|
| `BACKUP_DIR` | Dónde quedan los archivos. En un servidor, un disco aparte del de la base. | `backups/` |
| `BACKUP_RETENTION_DAYS` | Cuántos días se guardan antes de borrar los viejos. | 14 |
| `PG_BIN_DIR` | Dónde está `pg_dump` si no está en el PATH (en Windows no suele estarlo). | — |
| `HORA_DE_RESPALDO` | A qué hora del país (`TZ`) corre el respaldo de cada noche (servicio `respaldos`). | `02:00` |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_REGION` | La copia **fuera** del servidor, en R2 o cualquier S3. Vacío = desactivada. | desactivada |

`/health` dice cómo fue el último respaldo (`respaldos`: `al-dia`, `atrasado`
—más de 26 horas—, `fallo` o `sin-programar`), y un fallo deja una alerta
crítica en el panel del superadmin.

Para que corra solo, una vez al día, desde el programador de tareas del servidor.
Si algún liceo falla, el comando termina con error para que la tarea lo avise: un
respaldo que falla en silencio es peor que no tenerlo, porque da una tranquilidad
que no es real.

### Lo que hace que esto sea un respaldo y no un archivo

`tests/integration/respaldos.test.ts` hace el viaje completo contra PostgreSQL de
verdad: guarda un liceo, **le borra un año escolar y media lista de notas**, lo
restaura, y comprueba que volvió exactamente como estaba. Si esa prueba se cae,
hay que parar todo: significa que el día que haga falta no se va a poder devolver
la información de nadie.

También se comprueba que un respaldo fallido **no deja un archivo vacío** en la
carpeta: alguien podría verlo ahí y creer que tiene con qué restaurar.

### Medido con datos reales

El liceo de pruebas de carga —15.250 personas, 2,4 millones de notas, 600.000
asistencias— se respalda en **6 segundos y ocupa 38,8 MB**. A ese tamaño, 200
liceos son unos 8 GB y unos 20 minutos por noche.

---

## 9. La papelera: el borrado deja de ser definitivo

Cada liceo tiene una tabla `registros_borrados`. Antes de borrar cualquier fila
—una nota, una asistencia, un estudiante entero— se guarda una copia completa,
con quién la borró y desde dónde.

Si la copia no se puede guardar, **el borrado no ocurre**.

### Tarea diaria

```bash
npm run papelera:limpiar
```

Tira lo que lleva más de `PAPELERA_DIAS` días (90 por defecto). Sin esto la
papelera crece para siempre.

Va junto al respaldo diario, después: primero se guarda, luego se limpia.

### Borrar un liceo entero

`DELETE /api/superadmin/institutes/:id` hace `DROP DATABASE`. La papelera no lo
alcanza: vive dentro de esa misma base.

Por eso ahora **se respalda el liceo antes de borrarlo**. Si el respaldo falla, no
se borra nada y la respuesta es 409. La respuesta del borrado dice dónde quedó el
archivo — guardarlo antes de dar por buena la operación.

Hace falta `pg_dump` a mano (`PG_BIN_DIR` en Windows), igual que para los
respaldos del punto 8.

### Una regla que no se puede romper

Un liceo cuya base se haya creado con `prisma db push` **no se puede migrar nunca
más** (Prisma responde P3005 y solo acepta borrar la base). Ya pasó con la base de
pruebas de carga. En producción, solo `prisma migrate deploy`.

---

## 10. Que se levante solo si se cae

El servidor se cierra a propósito cuando ocurre una excepción que nadie atrapó:
después de eso su estado puede estar a medias, y seguir sirviendo desde ahí es
cómo se guardan datos corruptos (`src/utils/no-morir-en-silencio.ts`).

**Eso obliga a que haya alguien que lo vuelva a levantar.** Sin esto, el liceo se
queda abajo hasta que alguien lo note por teléfono:

```bash
pm2 start dist/index.js --name gestiedu-api --max-restarts 10
```

O con Docker, `restart: unless-stopped`. O una unidad de systemd con
`Restart=always`.

Las promesas rechazadas **no** cierran el servidor: se anotan y las clases
siguen. Conviene mirar ese registro: si aparecen a diario, hay una tarea de fondo
rota.

### Redis no es opcional

Si el servidor arranca sin Redis sigue funcionando, pero:

- no hay caché de lecturas (todo va a la base);
- con más de una instancia, **los avisos en vivo dejan de cruzar entre ellas**:
  quien esté en la instancia A no ve lo que se guarda en la B, y su pantalla se
  queda vieja sin que nadie lo note.

Comprobar `"redis":"connected"` en `GET /health` después de cada despliegue.

### Compilar en cada cambio, no el día del despliegue

```bash
cd apps/backend && npm run build
```

Ya pasó una vez que no compilaba y se descubrió tarde. Si el cliente de Prisma
queda desfasado, `npx prisma generate --schema=src/prisma/schema.prisma` lo
arregla.

### Medir la carga: contra producción, nunca contra desarrollo

`npm run dev` usa `tsx watch`, que vigila `node_modules` y **reinicia el servidor
a mitad de la prueba**, tirando todas las conexiones. Para medir: `npm run build`
y `npm start`. Y no tocar archivos mientras corre.

---

## Revisar las librerías, cada mes

```bash
npm audit --omit=dev
```

No es opcional ni es una vez. Se encontró **Next.js con dos fallos críticos de
ejecución remota de código sin autenticación** —uno específico de servidores
Windows— en la versión que estaba instalada. El código propio estaba bien; la
puerta la abría una librería.

Una librería segura hoy no lo es dentro de tres meses. Si aparece algo
**crítico o alto que llegue a producción**, se actualiza antes de desplegar.

Lo que sale con `--omit=dev` es lo que de verdad viaja al servidor. Sin esa
opción también salen las herramientas de desarrollo, que no se instalan allí.

---

## 9. Lo que todavía falta

- ~~Archivos subidos en el disco del servidor~~: los logos van a la base de la
  plataforma desde septiembre 2026 (`LOGO-01…05`). Los subidos antes siguen en
  el volumen `uploads` y se sirven igual.
- ~~Subir los respaldos fuera del servidor~~: `BACKUP_S3_*` (§8).
- La prueba en un servidor de verdad (abajo): **escrita, no ejecutada**.

## 10-bis. La prueba en un servidor (al final, cuando se decida)

Todo lo medido hasta ahora se midió en UN ordenador que hacía de servidor, de
base de datos y de generador de carga a la vez. Lo último medido ahí (septiembre
2026): **500 personas repartidas en 50 liceos, un solo proceso, p95 de 132 ms,
p99 de 298 ms y ningún fallo** (`docs/mediciones/`). Para saber lo que aguanta
de verdad hace falta separarlo:

1. **Tres máquinas**, alquiladas por horas y borradas al terminar:
   - la aplicación (este `docker-compose`, con `--scale backend=2` o más);
   - PostgreSQL con PgBouncer (o PostgreSQL en su máquina y el compose
     apuntando a ella);
   - la que genera la carga, que NO puede ser ninguna de las otras dos.
2. **Los liceos:** `LICEOS=200 npm run seed:muchos-liceos` (una plantilla
   pequeña copiada 200 veces; `-- --limpiar` los quita).
3. **La carga**, desde la tercera máquina contra la primera:
   ```bash
   API_REMOTA=https://<el-servidor> PLATFORM_DATABASE_URL=<la de ese servidor> \
   LICEOS='muchos-*' CLAVE='Test123!' ESCALONES=500,1000,2000,5000,10000,15000 \
     SEGUNDOS=120 npm run medir:estres
   ```
   Con `API_REMOTA` el guion no arranca su propio proceso: mide el que ya está
   en marcha. De la base de la plataforma saca los liceos y las cuentas.
   **Ojo con el límite de entrada:** todas las personas entran desde la
   dirección de la máquina de carga, y la pantalla de entrar cuenta por
   dirección (`RATE_LIMIT_MAX`, 100 por minuto): 15.000 entradas serían dos
   horas y media de espera. Para la prueba, subirlo en el servidor y volver a
   dejarlo como estaba al terminar.
4. **El criterio**, el mismo de siempre: en el servidor, **toda ruta con p95 ≤
   300 ms y p99 ≤ 1 s**, y menos de 1 % de fallos. Lo que pase de ahí se mira
   ruta por ruta en el JSON que queda en `docs/mediciones/`.
5. Se apaga todo.

Ver [AUDITORIA-2026-09-11.md](AUDITORIA-2026-09-11.md).
