# Ideas de otros sistemas para que Gestiedu aguante

Cristian pidió (18-oct-2026): «investiga qué otras lógicas podemos usar de otras apps y sistemas para mejorar el sistema y hacerlo lo más robusto». Cada idea dice qué es, quién la usa, si Gestiedu ya la tiene, cuánto cuesta y si conviene. Todas son lógica publicada; ninguna es código de nadie.

**Medir la conveniencia:**

- **Ya**: hecho o casi hecho.
- **Antes del piloto**: barato y protege mucho.
- **Después**: cuando haya varios liceos de verdad.
- **No por ahora**: más coste que beneficio.

| # | Idea (quién la usa) | ¿Gestiedu la tiene? | Coste | Conviene |
|---|---|---|---|---|
| 1 | **Cubos compartidos y deltas** (PowerSync, ElectricSQL, Linear) | Sí, desde hoy: la descarga en cubos | — | Ya |
| 2 | **Soltar carga**: con el servidor lleno, un «ahora no» rápido con `Retry-After` en vez de tragar hasta caerse (Google SRE) | Sí: `plugins/no-aceptar-mas-de-lo-que-aguanta.ts`, el 503 de la base y el azar en los reintentos | — | Ya |
| 3 | **Idempotencia**: un cambio no se aplica dos veces (Stripe, las claves de idempotencia) | Sí: `X-Cambio`, el freno del doble clic | — | Ya |
| 4 | **Errores agrupados por huella** (Sentry, Bugsnag) | Sí, desde hoy: superadmin → Salud | — | Ya |
| 5 | **Monitoreo sintético**: un robot que usa la app cada pocos minutos (Datadog Synthetics, Pingdom) | Sí, desde hoy: el robot del liceo de muestra | — | Ya |
| 6 | **SLO y presupuesto de errores**: una meta por botón (p95 < 800 ms, 99,9 % sin error) y alertas cuando se gasta (Google SRE) | A medias: el panel enseña p95 y errores, pero no hay metas ni alerta | Bajo | Antes del piloto |
| 7 | **Tope de tiempo por consulta** (`statement_timeout`): una consulta desbocada no se queda con la conexión para siempre (GitLab, Heroku) | **No**. Hoy una consulta lenta puede ocupar una conexión sin límite y hacer esperar a todo un liceo | Bajo: `ALTER ROLE … SET statement_timeout = '15s'` en la base de cada servidor (con PgBouncer va en el rol, no en la URL) | **Antes del piloto** |
| 8 | **Cortacircuitos**: si un servicio de fuera falla, se deja de llamarlo un rato (Netflix Hystrix, Resilience4j) | Sí para la tasa del BCV (5 min sin volver a preguntar); no hay más servicios de fuera en el camino de un clic | — | Ya |
| 9 | **Mamparos**: un liceo pesado no ahoga a los demás (topes por inquilino: Slack, Shopify) | A medias: cada liceo tiene su tope de conexiones (`connection_limit`), pero el cupo de CPU del proceso es de todos | Medio | Después |
| 10 | **Tareas con una sola dueña**: con varios procesos, cada tarea programada la hace uno solo y se reparten los liceos (Sidekiq, un *lease* en la base) | **No**. Hoy cada proceso repite el cuadro de honor, el recordatorio de cuotas y el mantenimiento, y recorren los liceos en serie (sin duplicar resultados, pero con trabajo de más) | Bajo: una tabla de turnos en la plataforma | Antes del piloto |
| 11 | **Outbox**: los avisos y lo que va fuera se apuntan en la misma transacción y otro los manda (Debezium, el patrón *transactional outbox*) | No: el aviso se manda después de guardar; si el proceso muere justo ahí, el aviso se pierde (el dato no) | Medio | Después |
| 12 | **Despliegue gradual por liceo**: una versión nueva primero en un liceo canario, con interruptor y vuelta atrás (Facebook Gatekeeper, LaunchDarkly) | No | Medio | Después (con 5 o más liceos) |
| 13 | **Réplicas de lectura** para reportes pesados (cualquier SaaS grande) | No | Alto (otro servidor de base) | Después: cuando el panel diga que la base es el cuello |
| 14 | **Vistas preparadas** para estadísticas (Postgres *materialized views*; aquí, la misma idea que los cubos) | A medias: promedios precalentados; el Inicio del admin aún se calcula al pedirlo (3,7 s en frío, lo midió el robot) | Medio | Antes del piloto, para el Inicio del admin |
| 15 | **Trazas de punta a punta** (OpenTelemetry): ver una petición desde el teléfono hasta la base | No; el medidor da el tiempo por ruta, no por paso | Medio | Después |
| 16 | **Pruebas de caos**: tumbar Redis, la base o un proceso a propósito (Netflix Chaos Monkey) | A medias: APAGADO-* tumba el servidor y CUPO-* prueba sin Redis | Bajo | Antes del piloto: un guion que tumbe la base 30 s en medio de una tanda |
| 17 | **CDN para lo que no cambia**: el diseño de la app y los cubos compartidos servidos desde la orilla (Cloudflare) | El diseño va dentro de la APK; los cubos aún salen de Node | Bajo con nginx (`X-Accel-Redirect`, `proxy_cache_lock`) | Después del piloto |

## Lo que se hizo esta noche

1, 4 y 5 (los cubos, el panel de salud y el robot).

## Lo que conviene antes del piloto

7, 10, 6, 14 y 16, en ese orden: lo primero protege más y cuesta menos.
