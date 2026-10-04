# Arquitectura General del Sistema de Gestión Escolar

Este documento describe la arquitectura global, el diseño técnico y el catálogo detallado de archivos del sistema, explicando el propósito y funcionamiento de cada componente en las capas de Backend, Frontend, Aplicación Móvil e Infraestructura.

---

## 1. Visión General de la Arquitectura

El sistema es una plataforma integral de gestión académica y administrativa adaptada a la normativa educativa de Venezuela (Educación Media General y Media Técnica según lineamientos del MPPE).

### 1.1 Modelo Multi-Tenant con Aislamiento por Base de Datos

El sistema opera bajo un esquema multi-inquilino (*multi-tenant*) estricto con aislamiento físico de bases de datos:

1. **Base de Datos de Plataforma (`plataforma`):**
   - Centraliza el registro de instituciones educativas (liceos), sus subdominios/slugs, planes contratados (Básico, Premium, Enterprise), cuotas de almacenamiento, límites de estudiantes/docentes, auditorías globales y credenciales del Superadministrador.

2. **Base de Datos por Liceo (`tenant`):**
   - Cada institución educativa dispone de su propia base de datos PostgreSQL independiente.
   - Alberga el año escolar, lapsos académicos, estudiantes, profesores, secciones, materias, planes de evaluación, notas de clase, asistencias, horarios, representantes, pagos y constancias oficiales.
   - Garantiza que ninguna institución pueda consultar, mezclar o alterar los registros de otra institución.

### 1.2 Pila Tecnológica

- **Monorepo:** Turborepo con gestión de dependencias vía pnpm / npm.
- **Backend:** Fastify sobre Node.js con TypeScript, Prisma ORM, Redis para caché de consultas y pub/sub en tiempo real, Socket.IO para eventos instantáneos, PgBouncer para gestión eficiente de conexiones a PostgreSQL.
- **Frontend:** Next.js 16 (App Router con Turbopack), React 19, Tailwind CSS, Lucide Icons, Headless UI / Radix UI, TanStack React Query v5, Zustand.
- **Aplicación Móvil:** Capacitor 7 para Android (WebView adaptable a pantalla completa, integración con cámara, biometría nativa, soporte offline mediante IndexedDB con sincronización posterior).

---

## 2. Archivos de Raíz e Infraestructura

| Archivo | Función y Propósito |
| :--- | :--- |
| `docker-compose.yml` | Orquesta los servicios locales de desarrollo: PostgreSQL, Redis y PgBouncer. |
| `docker-compose.prod.yml` | Configuración para despliegue de contenedores en entornos de producción con réplicas y políticas de reinicio. |
| `turbo.json` | Configuración de pipelines de compilación, ejecución y caché distribuido de Turborepo. |
| `package.json` | Definición de scripts raíz del monorepo (`dev`, `build`, `lint`, `test`) y dependencias compartidas. |
| `inicio.ps1` | Script interactivo de PowerShell para Windows que verifica dependencias, inicia servicios Docker, backend y frontend. |
| `inicio.bat` | Lanzador en formato Batch tradicional para entornos Windows que llama al flujo de inicialización. |
| `playwright.config.ts` | Configuración para pruebas automatizadas end-to-end con Playwright (navegadores, puertos y reportes). |
| `tsconfig.json` | Configuración base del compilador de TypeScript para todo el monorepo. |
| `.env.example` | Plantilla de variables de entorno para desarrollo (puertos, secretos JWT, URLs de conexión). |
| `.env.production.example` | Plantilla de variables de entorno para entornos de producción seguros. |

---

## 3. Scripts de Mantenimiento y Calidad (`scripts/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `scripts/servidores-para-el-telefono.mjs` | Configura e inicializa los servidores backend y frontend enlazados a la IP de red local para pruebas desde dispositivos móviles. |
| `scripts/auditoria-del-telefono.mjs` | Analiza el comportamiento responsivo y métricas de carga en resoluciones de pantalla de teléfonos móviles. |
| `scripts/recorrido-del-diseno.mjs` | Script de navegación automatizada para capturar pantallas y verificar la coherencia visual de la interfaz. |
| `scripts/reglas-de-claridad.mjs` | Validador estático de reglas de código limpio, consistencia terminológica y ausencia de elementos visuales no permitidos. |
| `scripts/reglas-del-diseno.mjs` | Comprueba el cumplimiento de directrices de espaciado, colores y componentes de diseño en el frontend. |
| `scripts/reglas-del-telefono.mjs` | Valida que las pantallas no tengan desbordamientos horizontales ni elementos inaccesibles al pulgar en móviles. |

---

## 4. Backend (`apps/backend/`)

Servidor API REST de alto rendimiento desarrollado en Fastify y TypeScript.

### 4.1 Punto de Entrada y Configuración (`apps/backend/src/config/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `src/server.ts` | Punto de entrada del backend. Registra plugins, middlewares, controladores, cron jobs y levanta el servidor HTTP. |
| `src/config/environment.ts` | Carga, valida y tipifica las variables de entorno del backend mediante esquemas estrictos. |
| `src/config/database.ts` | Administrador de clientes Prisma. Maneja la conexión a la base de plataforma y el pool de conexiones dinámicas por tenant. |
| `src/config/tenant-db-url.ts` | Construye de forma dinámica las URLs de conexión a PostgreSQL para cada base de datos institucional. |
| `src/config/tenant-isolation.ext.ts` | Extensión de Prisma que inyecta automáticamente filtros de seguridad y aislamiento en cada consulta SQL. |
| `src/config/ambito-del-liceo.ts` | Utiliza `AsyncLocalStorage` de Node.js para propagar el contexto del tenant activo a lo largo de toda la petición. |
| `src/config/redis.ts` | Cliente de conexión a Redis para almacenamiento de caché, sesiones y colas de eventos. |
| `src/config/cache-ttl.ts` | Define los tiempos de vida (TTL) de las claves en memoria según la volatilidad de cada dato (estudiantes, notas, catálogos). |
| `src/config/jwt.ts` | Configura claves de firma, algoritmos y tiempos de expiración de tokens JWT de acceso y de refresco. |
| `src/config/plans.ts` | Especifica las cuotas y características de cada plan comercial (almacenamiento máximo, usuarios permitidos). |
| `src/config/de-quien-nos-fiamos.ts` | Define listas blancas de orígenes, dominios y proxies de confianza para CORS y cabeceras de red. |

### 4.2 Plugins de Fastify (`apps/backend/src/plugins/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `src/plugins/prisma.ts` | Registra el cliente de base de datos dentro del ciclo de vida de Fastify para cerrarlo limpiamente al apagar. |
| `src/plugins/redis.ts` | Conecta y verifica la salud de la instancia de Redis al iniciar el servidor. |
| `src/plugins/jwt.ts` | Integra el soporte de verificación y firma de tokens JWT en las rutas protegidas. |
| `src/plugins/cors.ts` | Controla los encabezados CORS permitiendo peticiones desde la web, el emulador y la app móvil. |
| `src/plugins/helmet.ts` | Aplica cabeceras de seguridad HTTP (CSP, HSTS, X-Content-Type-Options) contra vulnerabilidades comunes. |
| `src/plugins/swagger.ts` | Genera documentación interactiva OpenAPI/Swagger de todos los endpoints de la API. |
| `src/plugins/socket.ts` | Configura el servidor WebSocket (Socket.IO) para notificaciones y alertas en tiempo real. |
| `src/plugins/no-aceptar-mas-de-lo-que-aguanta.ts` | Mecanismo de protección contra sobrecarga que monitorea el retardo del Event Loop y descarta peticiones si se satura. |
| `src/plugins/cupo-compartido.ts` | Rate limiter distribuido en Redis que previene abusos de peticiones por IP o por usuario. |
| `src/plugins/anti-doble-envio.ts` | Filtro de idempotencia que previene registrar dos veces pagos o calificaciones por clics repetidos. |
| `src/plugins/avisar-cambios.ts` | Emite eventos de Socket.IO hacia los clientes conectados cuando ocurren cambios en notas o asistencias. |
| `src/plugins/cambios-sin-conexion.ts` | Procesa y reconcilia paquetes de datos enviados por dispositivos móviles tras recuperar la conexión a internet. |

### 4.3 Middlewares (`apps/backend/src/middleware/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `src/middleware/tenant.middleware.ts` | Resuelve qué liceo realiza la petición a partir del subdominio o la cabecera `X-Institute-Slug` y activa su base de datos. |
| `src/middleware/auth.middleware.ts` | Valida el token JWT en las cabeceras de autorización y adjunta el usuario autenticado a la petición. |
| `src/middleware/roles.middleware.ts` | Verifica que el usuario tenga los permisos necesarios (ADMIN, TEACHER, STUDENT, TUTOR) para acceder al recurso. |
| `src/middleware/superadmin-auth.middleware.ts` | Protege exclusivamente las rutas de gestión global de la plataforma, permitiendo solo a Superadministradores. |
| `src/middleware/guardias.ts` | Reglas de acceso fino: valida si un profesor imparte clase en la sección específica a la que intenta ingresar notas. |
| `src/middleware/smart-cache.middleware.ts` | Intercepta peticiones GET para responder desde la caché de Redis si los datos no han cambiado, ahorrando lecturas SQL. |
| `src/middleware/plan-limits.middleware.ts` | Verifica si el liceo ha alcanzado el límite de estudiantes, profesores o almacenamiento de su plan antes de crear registros. |
| `src/middleware/validation.middleware.ts` | Valida el cuerpo, parámetros y consultas de las solicitudes HTTP mediante esquemas de Zod. |
| `src/middleware/error.middleware.ts` | Captura excepciones no controladas y devuelve respuestas JSON limpias y homogéneas sin exponer detalles internos. |

### 4.4 Modelos y Esquemas de Base de Datos (`apps/backend/src/prisma/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `src/prisma/schema.prisma` | Esquema del tenant (liceo): usuarios, años escolares, secciones, materias, planes de evaluación, notas, asistencia, pagos. |
| `src/prisma/plataforma/schema.prisma` | Esquema de plataforma global: institutos, planes, métricas de consultas, logs de auditoría global y superadministradores. |

### 4.5 Controladores (`apps/backend/src/controllers/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `src/controllers/auth.controller.ts` | Maneja el login de usuarios, renovación de credenciales, cierre de sesión y consulta de perfil. |
| `src/controllers/academic-years.controller.ts` | Gestión de años escolares (ej: 2025-2026), definición de lapsos y estado del ciclo académico. |
| `src/controllers/classrooms.controller.ts` | Creación y administración de aulas/secciones (1er Año A, 2do Año B) y asignación de profesores guía. |
| `src/controllers/subjects.controller.ts` | Catálogo de asignaturas por año de estudio según malla curricular venezolana. |
| `src/controllers/classroomSubjects.controller.ts` | Vinculación entre sección, materia y docente asignado para impartirla. |
| `src/controllers/evaluation-plan.controller.ts` | Creación, edición, aprobación y ponderación de los Planes de Evaluación por materia y lapso. |
| `src/controllers/activities.controller.ts` | Gestión de actividades individuales pertenecientes al plan de evaluación (fechas, técnicas, instrumentos, porcentajes). |
| `src/controllers/grades.controller.ts` | Registro, modificación y consulta de calificaciones cuantitativas (escala 01 a 20) y notas de clase. |
| `src/controllers/attendance.controller.ts` | Toma de asistencia diaria o por bloque horario (presente, ausente, justificado, retraso). |
| `src/controllers/asistencia-qr.controller.ts` | Generación y lectura de códigos QR para pase rápido de asistencia desde el dispositivo móvil. |
| `src/controllers/schedules.controller.ts` | Configuración y consulta de horarios escolares por aula, docente y franjas horarias. |
| `src/controllers/scheduleBlocks.controller.ts` | Bloques individuales de horario asignados por día y hora. |
| `src/controllers/classSessions.controller.ts` | Registro de clases en vivo, temas cubiertos y seguimiento de avances en el aula. |
| `src/controllers/class-replacements.controller.ts` | Gestión de suplencias de docentes ausentes en clases específicas. |
| `src/controllers/students.controller.ts` | Expediente del estudiante, matrícula escolar, datos médicos y asignación de sección. |
| `src/controllers/student-tutors.controller.ts` | Asociación y control de representantes legales vinculados a cada alumno. |
| `src/controllers/student-history.controller.ts` | Historial académico consolidado del alumno a lo largo de los distintos años escolares. |
| `src/controllers/teachers.controller.ts` | Gestión del personal docente, especialidades, carga horaria semanal y materias a cargo. |
| `src/controllers/users.controller.ts` | Altas, bajas, cambios de contraseña y administración de cuentas de usuario en el liceo. |
| `src/controllers/pagos.controller.ts` | Registro y conciliación de pagos de mensualidades, transferencias, pago móvil y comprobantes. |
| `src/controllers/finanzas.controller.ts` | Balances de cobranza, deudas pendientes, solvencias y estado financiero general del plantel. |
| `src/controllers/boleta.controller.ts` | Generación de boletas oficiales de calificaciones por lapso y acumuladas. |
| `src/controllers/constancias.controller.ts` | Emisión de constancias de estudio, buena conducta y tramitación de documentos escolares. |
| `src/controllers/resumen-final.controller.ts` | Resumen de calificaciones finales, actas de evaluación y preparación para revisión/reparación. |
| `src/controllers/revision.controller.ts` | Exámenes de revisión (reparación) y registro de notas extraordinarias según normativa MPPE. |
| `src/controllers/fin-de-ano.controller.ts` | Proceso formal de cierre de año escolar, evaluación de criterios de promoción y pase al siguiente nivel. |
| `src/controllers/matricula.controller.ts` | Estadísticas e informes de matrícula inicial, modificaciones y matrícula final. |
| `src/controllers/materias-pendientes.controller.ts` | Seguimiento de materias que adeudan estudiantes promovidos con asignatura pendiente. |
| `src/controllers/labor-social.controller.ts` | Control y acreditación de las horas de labor social comunitaria requeridas para graduación. |
| `src/controllers/citaciones.controller.ts` | Emisión de citaciones oficiales a representantes para reuniones pedagógicas o disciplinarias. |
| `src/controllers/apreciaciones.controller.ts` | Observaciones cualitativas e informes descriptivos del comportamiento y desempeño del estudiante. |
| `src/controllers/avisos.controller.ts` | Publicación de comunicados y circulares institucionales para la comunidad educativa. |
| `src/controllers/school-events.controller.ts` | Calendario de eventos, efemérides y actividades cívicas o culturales del liceo. |
| `src/controllers/documentos.controller.ts` | Almacenamiento y descarga de documentos institucionales y recaudos estudiantiles. |
| `src/controllers/foto-de-perfil.controller.ts` | Carga, optimización y recorte de fotos de perfil de usuarios. |
| `src/controllers/dashboard.controller.ts` | Entrega de métricas y tarjetas informativas (KPIs) para los paneles principales. |
| `src/controllers/cycle-statistics.controller.ts` | Estadísticas globales de rendimiento académico, aprobación y deserción por ciclo. |
| `src/controllers/monitoring.controller.ts` | Verificación de salud del sistema (`/health`) y monitoreo de recursos del servidor. |
| `src/controllers/cache-metrics.controller.ts` | Estadísticas de aciertos y fallos en la memoria caché de Redis. |
| `src/controllers/superadmin-auth.controller.ts` | Autenticación y gestión de sesiones para el Superadministrador de la plataforma. |
| `src/controllers/superadmin-institutes.controller.ts` | Aprovisionamiento, edición, suspensión y migración de liceos registrados. |

### 4.6 Servicios y Lógica de Negocio (`apps/backend/src/services/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `src/services/auth.service.ts` | Lógica de validación de contraseñas con bcrypt, emisión de JWT y refresco de tokens. |
| `src/services/authorization.service.ts` | Comprobación de propiedad de recursos para evitar accesos indebidos entre secciones o docentes. |
| `src/services/grades.service.ts` | Reglas de cálculo de calificaciones parciales, definitivas de lapso y cómputo de 70%-30%. |
| `src/services/attendance.service.ts` | Procesamiento de asistencias, cálculo de porcentajes y alertas por inasistencias críticas. |
| `src/services/schedules.service.ts` | Validación de solapamientos de horarios de aulas y de profesores en las mismas horas. |
| `src/services/schedule-conflicts.service.ts` | Detector algorítmico de conflictos de disponibilidad física de aulas y horas de docentes. |
| `src/services/promotion/close-cycle.service.ts` | Orquestador del cierre del año escolar y pase de estudiantes promovidos. |
| `src/services/promotion/reglas-del-fin-de-ano.ts` | Implementación exacta de la normativa venezolana de promoción (máximo de materias reprobadas, repitencia). |
| `src/services/promotion/strategies.ts` | Estrategias de promoción diferenciadas para Básica, Diversificada y Media Técnica. |
| `src/services/pagos.service.ts` | Registro atómico de pagos con bloqueos transaccionales para evitar doble procesamiento. |
| `src/services/finanzas.service.ts` | Generación de estados de cuenta por representante, cálculos de mora y solvencias. |
| `src/services/boleta.service.ts` | Construcción de datos estructurados para impresión de boletas de calificaciones. |
| `src/services/constancias.service.ts` | Creación de constancias oficiales de estudio con formato institucional venezolano. |
| `src/services/asistencia-qr.service.ts` | Generación de tokens criptográficos temporales para códigos QR de asistencia. |
| `src/services/importar-plan-de-word.ts` | Procesador y extractor de tablas de evaluación desde archivos docx subidos por profesores. |
| `src/services/respaldos.service.ts` | Ejecución de copias de seguridad de bases de datos PostgreSQL mediante `pg_dump`. |
| `src/services/tenant-provisioning.service.ts` | Creación automática de nuevas bases de datos y ejecución de migraciones para nuevos liceos. |
| `src/services/tenant-migrations.service.ts` | Aplica actualizaciones del esquema de base de datos a todas las instituciones registradas de forma segura. |
| `src/services/llave-del-telefono.service.ts` | Gestión de tokens de acceso rápido para autenticación biométrica en dispositivos móviles. |

### 4.7 Tareas Programadas (`apps/backend/src/jobs/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `src/jobs/metrics-collector.job.ts` | Tarea periódica que recopila tiempos de consulta y uso de recursos del servidor. |
| `src/jobs/monitor-storage.job.ts` | Mide el tamaño en disco de cada base de datos y carpeta de archivos para controlar límites de plan. |
| `src/jobs/academic-year-sync.job.ts` | Comprueba fechas del calendario escolar y actualiza el lapso activo según las fechas oficiales. |
| `src/jobs/recordatorio-de-cuotas.job.ts` | Envía notificaciones de cobro a representantes antes de las fechas límite de mensualidad. |

### 4.8 Utilidades del Backend (`apps/backend/src/utils/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `src/utils/calendario-mppe.ts` | Días hábiles escolares, feriados nacionales venezolanos y períodos de receso oficial. |
| `src/utils/cedula-escolar.ts` | Generador y validador del código de Cédula Escolar para estudiantes sin cédula de identidad formal. |
| `src/utils/lapso-average.ts` | Fórmulas matemáticas para el cálculo de notas definitivas de lapso escolar. |
| `src/utils/franjas-del-horario.ts` | Conversor y normalizador de bloques de tiempo matutinos, vespertinos e integrales. |
| `src/utils/error-claro.ts` | Traductor de errores de base de datos o validaciones a mensajes comprensibles para el usuario. |
| `src/utils/papelera.ts` | Mecanismo de borrado lógico (*soft delete*) para prevenir pérdida accidental de información académica. |
| `src/utils/concurrencia.ts` | Utilidades para sincronización de procesos y bloqueos atómicos en bases de datos. |

---

## 5. Frontend Web y Móvil Adaptable (`apps/web/`)

Aplicación desarrollada en Next.js 16 con interfaz adaptable para escritorio, tabletas y teléfonos inteligentes.

### 5.1 Configuración y Enrutamiento (`apps/web/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `next.config.js` | Configuración de Next.js: subdominios permitidos, proxy reverso hacia el backend (`/api` y `/uploads`), dominios de imágenes. |
| `package.json` | Dependencias del frontend: React 19, componentes Radix, Tailwind CSS, Lucide Icons, React Query, Zustand. |
| `src/config/env.ts` | URLs del backend y helper `getAssetUrl` para servir imágenes mediante proxy en la web y el emulador. |

### 5.2 Páginas y Rutas de la Aplicación (`apps/web/src/app/`)

| Ruta | Función y Propósito |
| :--- | :--- |
| `src/app/layout.tsx` | Layout raíz del frontend con fuentes, proveedores globales y cabeceras de metadatos. |
| `src/app/page.tsx` | Landing page principal del sistema, selector de acceso institucional e información de la plataforma. |
| `src/app/(auth)/login/page.tsx` | Pantalla de inicio de sesión con detección de instituto por subdominio o parámetro, y acceso con huella. |
| `src/app/(dashboard)/layout.tsx` | Estructura contenedora del panel interno: barra lateral en PC, cabecera móvil y barra inferior en teléfonos. |
| `src/app/(dashboard)/dashboard/page.tsx` | Panel de control principal con KPIs específicos según el rol del usuario (Admin, Profesor, Alumno, Representante). |
| `src/app/(dashboard)/dashboard/academico/page.tsx` | Gestión de años escolares, lapsos activos y vista general del ciclo académico. |
| `src/app/(dashboard)/dashboard/aulas/page.tsx` | Directorio de secciones y aulas organizadas por año de estudio con profesor guía y capacidad. |
| `src/app/(dashboard)/dashboard/materias/page.tsx` | Gestión de asignaturas escolares, asignación de docentes por sección y configuración de planes. |
| `src/app/(dashboard)/dashboard/estudiantes/page.tsx` | Directorio de estudiantes matriculados con filtros por año, sección y estado académico. |
| `src/app/(dashboard)/dashboard/profesores/page.tsx` | Directorio de personal docente con horarios asignados y especialidades. |
| `src/app/(dashboard)/dashboard/horarios/page.tsx` | Visualizador y editor interactivo de horarios escolares para secciones y docentes. |
| `src/app/(dashboard)/dashboard/asistencia/page.tsx` | Módulo de toma y control de asistencia con selector de fecha, bloque y escaneo QR. |
| `src/app/(dashboard)/dashboard/calificaciones/page.tsx` | Módulo de carga y revisión de notas de evaluación continua y de lapso. |
| `src/app/(dashboard)/dashboard/pagos/page.tsx` | Administración de mensualidades, registro de transferencias y emisión de comprobantes de pago. |
| `src/app/(dashboard)/dashboard/documentos/page.tsx` | Emisión y descarga de boletas oficiales, constancias de estudio y reportes administrativos. |
| `src/app/(dashboard)/dashboard/usuarios/page.tsx` | Directorio y control de cuentas de acceso para el personal del liceo. |
| `src/app/(dashboard)/dashboard/configuracion/page.tsx` | Ajustes institucionales: escudo, nombre del plantel, colores, turnos y datos oficiales MPPE. |
| `src/app/superadmin/dashboard/page.tsx` | Panel de control global para gestión de liceos clientes, métricas de servidores y facturación SaaS. |

### 5.3 Componentes de Navegación y Móvil (`apps/web/src/components/layout/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `src/components/layout/Sidebar.tsx` | Menú lateral colapsable para pantallas de escritorio con navegación completa por módulos. |
| `src/components/layout/CabeceraMovil.tsx` | Cabecera superior para teléfonos móviles con nombre del liceo, avatar de usuario y estado de conexión. |
| `src/components/layout/BarraInferiorMovil.tsx` | Barra de navegación táctil fija en la parte inferior de pantallas móviles para acceso rápido con el pulgar. |
| `src/components/layout/DashboardShell.tsx` | Contenedor principal que envuelve el contenido ajustando márgenes según la pantalla sea móvil o escritorio. |

### 5.4 Librerías y Clientes del Frontend (`apps/web/src/lib/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `src/lib/axios.ts` | Cliente HTTP con inyección automática de tokens JWT, tenant slug y soporte de conexión a `10.0.2.2` en emulador. |
| `src/lib/credencial-en-memoria.ts` | Almacenamiento seguro del token de sesión en memoria volátil de la pestaña para evitar robos de sesión por XSS. |
| `src/lib/base-del-telefono.ts` | Gestión de almacenamiento local en el dispositivo (IndexedDB) para consulta de datos sin conexión a internet. |
| `src/lib/la-huella.ts` | Interfaz con la API de autenticación biométrica (huella dactilar / Face ID) para inicio de sesión instantáneo. |
| `src/lib/calendario-mppe.ts` | Reglas y cálculos del calendario del año escolar en Venezuela en el lado del cliente. |
| `src/lib/foto-comprimida.ts` | Comprime imágenes en el propio dispositivo antes de enviarlas al servidor para ahorrar datos y memoria. |
| `src/lib/imprimir.ts` | Utilidad de formateo y estilos para impresión limpia de boletas, constancias y horarios. |
| `src/lib/el-liceo-de-la-direccion.ts` | Extrae y normaliza el slug del liceo a partir del dominio o subdominio del navegador. |

### 5.5 Estado Global y Proveedores (`apps/web/src/store/` y `apps/web/src/providers/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `src/store/auth.store.ts` | Estado global de sesión del usuario (usuario activo, rol, permisos) gestionado con Zustand. |
| `src/store/superadmin-auth.store.ts` | Estado de autenticación para administradores de la plataforma global. |
| `src/providers/QueryProvider.tsx` | Proveedor de TanStack React Query que gestiona caché en memoria, reintentos y mutaciones asíncronas. |
| `src/providers/TiempoRealProvider.tsx` | Mantiene la conexión WebSocket activa con el servidor para refrescar datos instantáneamente. |
| `src/providers/MemoriaDelTelefono.tsx` | Proveedor que detecta cortes de señal y activa el modo de lectura sin conexión automáticamente. |
| `src/providers/EnviarLoPendiente.tsx` | Cola en segundo plano que sincroniza acciones tomadas sin conexión cuando el dispositivo recupera internet. |

---

## 6. Aplicación Móvil Android (`apps/movil/`)

Contenedor nativo de Android basado en Capacitor 7 que empaqueta y optimiza la experiencia del sistema escolar en teléfonos.

| Archivo | Función y Propósito |
| :--- | :--- |
| `capacitor.config.json` | Configuración de Capacitor: identificador de la app (`appId`), nombre de la app y URL del servidor web. |
| `android/app/src/main/AndroidManifest.xml` | Manifiesto de Android con permisos del sistema (cámara, almacenamiento, biometría, red). |
| `android/app/src/main/java/com/gestiedu/app/MainActivity.java` | Actividad nativa principal en Java: configura pantalla completa, gestión de descargas con DownloadManager y color de barra de estado. |
| `android/app/src/main/java/com/gestiedu/app/AsistenciaQrPlugin.java` | Plugin nativo para captura y procesamiento de códigos QR mediante la cámara del teléfono. |
| `android/app/src/main/java/com/gestiedu/app/ImprimirPlugin.java` | Puente con el servicio de impresión de Android para enviar boletas directamente a impresoras térmicas o PDF. |
| `android/app/src/main/java/com/gestiedu/app/ActualizarAppPlugin.java` | Verifica si existe una versión más reciente de la aplicación disponible para instalación. |
| `scripts/preparar-liceo.mjs` | Script de personalización que inyecta el logo, colores, slug e icono específico del liceo para compilar un APK personalizado. |
| `scripts/publicar-apk.mjs` | Compila el instalador `.apk` de depuración o de producción listo para instalar en dispositivos Android. |
| `www/index.html` | Pantalla de contingencia que se muestra si la aplicación abre sin internet y sin datos cacheados. |

---

## 7. Paquetes Compartidos (`packages/` y `shared/`)

| Archivo | Función y Propósito |
| :--- | :--- |
| `shared/backend-config.json` | Especificación compartida de nombres de endpoints y estructuras comunes entre backend y frontend. |
| `packages/config/typescript-config/tsconfig.json` | Configuración estricta de TypeScript heredada por todos los proyectos del monorepo. |
| `packages/config/tailwind-config/` | Paleta de colores, tipografías y temas compartidos de Tailwind CSS. |
| `packages/config/eslint-config/` | Reglas de estilo y calidad de código para mantener uniformidad en el desarrollo. |

---

## 8. Flujo de Datos y Ciclo de Vida de una Petición

```
[Dispositivo Móvil / Navegador Web]
             │
             ▼
   [Next.js App (Puerto 3000)]
   - Resuelve el subdominio o parámetro del liceo.
   - Aplica el diseño responsivo (Escritorio o Móvil).
   - Realiza llamadas vía Axios / React Query.
             │
             ▼
   [Fastify Backend (Puerto 3001)]
   - Middleware de Tenant: identifica el liceo y activa su contexto con AsyncLocalStorage.
   - Middleware de Autenticación: valida el token JWT del usuario.
   - Smart Cache Middleware: verifica si el dato existe en Redis.
             │
      ┌──────┴──────┐
      │             │
(En Caché)     (No en Caché)
      │             │
      ▼             ▼
   [Redis]    [PgBouncer / PostgreSQL]
   Retorna    Ejecuta consulta sobre la BD
   instantáneo específica del liceo (Tenant DB).
                    │
                    ▼
               Guarda en Redis y
               responde al cliente.
```

---
*Documento generado para referencia arquitectónica y técnica del Sistema de Gestión Escolar.*
