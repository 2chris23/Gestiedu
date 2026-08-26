# 🚀 Sistema de Rutas - Gestión Escolar

Este directorio contiene todas las rutas de la API del Sistema de Gestión Escolar. Cada archivo implementa endpoints RESTful con validación completa, middleware de seguridad y manejo de errores.

## 📁 Estructura de Archivos

```
routes/
├── index.ts                    # 🔧 Exportación centralizada de todas las rutas
├── auth.routes.ts             # 🔐 Autenticación y autorización
├── users.routes.ts            # 👤 Gestión de usuarios
├── students.routes.ts         # 🎓 Rutas específicas para estudiantes
├── teachers.routes.ts         # 👨‍🏫 Rutas específicas para profesores
├── classrooms.routes.ts       # 🏫 Gestión de aulas
├── subjects.routes.ts         # 📚 Gestión de materias
├── activities.routes.ts       # 📝 Actividades académicas
├── grades.routes.ts           # 📊 Calificaciones
├── attendance.routes.ts       # ✅ Asistencia
├── schedules.routes.ts        # 📅 Horarios
├── notifications.routes.ts    # 🔔 Notificaciones
├── reports.routes.ts          # 📈 Reportes
├── dashboard.routes.ts        # 📋 Dashboards
├── institutes.routes.ts       # 🏛️ Gestión de institutos (multitenancy)
└── README.md                  # 📖 Esta documentación
```

## 🔗 Endpoints Principales

### 🔐 Autenticación (`/api/auth`)
- `POST /login` - Iniciar sesión
- `POST /register` - Registrar usuario
- `POST /refresh-token` - Renovar token
- `POST /logout` - Cerrar sesión
- `GET /profile` - Obtener perfil
- `POST /change-password` - Cambiar contraseña

### 👤 Usuarios (`/api/users`)
- `GET /` - Listar usuarios (con filtros y paginación)
- `GET /:id` - Obtener usuario por ID
- `POST /` - Crear usuario (admin)
- `PUT /:id` - Actualizar usuario (admin)
- `DELETE /:id` - Eliminar usuario (admin)
- `GET /profile/me` - Perfil personal
- `PUT /profile/me` - Actualizar perfil personal

### 🎓 Estudiantes (`/api/students`)
- `GET /` - Listar estudiantes
- `POST /` - Crear estudiante (admin)
- `GET /my-grades` - Mis calificaciones
- `GET /my-attendance` - Mi asistencia
- `GET /my-subjects` - Mis materias
- `GET /my-dashboard` - Dashboard del estudiante

### 👨‍🏫 Profesores (`/api/teachers`)
- `GET /` - Listar profesores
- `POST /` - Crear profesor (admin)
- `GET /my-subjects` - Mis materias
- `GET /my-classrooms` - Mis aulas
- `GET /my-dashboard` - Dashboard del profesor

### 🏫 Aulas (`/api/classrooms`)
- `GET /` - Listar aulas
- `POST /` - Crear aula (admin)
- `GET /:id/students` - Estudiantes del aula
- `GET /:id/subjects` - Materias del aula
- `POST /:id/teachers` - Asignar profesor

### 📚 Materias (`/api/subjects`)
- `GET /` - Listar materias
- `POST /` - Crear materia (admin)
- `GET /grade/:grade` - Materias por grado
- `POST /:id/teachers` - Asignar profesor
- `GET /:id/students` - Estudiantes de la materia

### 📝 Actividades (`/api/activities`)
- `GET /` - Listar actividades
- `POST /` - Crear actividad (profesor)
- `GET /student/my-activities` - Mis actividades (estudiante)
- `POST /:id/submit` - Enviar tarea (estudiante)
- `GET /:id/submissions` - Ver entregas (profesor)

### 📊 Calificaciones (`/api/grades`)
- `GET /` - Listar calificaciones
- `POST /` - Crear calificación (profesor)
- `POST /bulk` - Calificación masiva
- `GET /student/my-grades` - Mis notas (estudiante)
- `GET /export/:format` - Exportar notas (excel/pdf/csv)

### ✅ Asistencia (`/api/attendance`)
- `POST /` - Registrar asistencia
- `POST /bulk` - Asistencia masiva
- `GET /student/:id` - Asistencia del estudiante
- `GET /classroom/:id` - Asistencia del aula
- `GET /summary/student/:id` - Resumen de asistencia

### 📅 Horarios (`/api/schedules`)
- `GET /` - Listar horarios
- `POST /` - Crear horario (profesor)
- `GET /daily` - Horarios del día
- `GET /weekly` - Horarios de la semana
- `GET /monthly` - Horarios del mes

### 🔔 Notificaciones (`/api/notifications`)
- `GET /my-notifications` - Mis notificaciones
- `POST /` - Crear notificación (profesor)
- `POST /system` - Notificación del sistema (admin)
- `POST /bulk` - Notificación masiva
- `PATCH /:id/read` - Marcar como leída

### 📈 Reportes (`/api/reports`)
- `GET /grades` - Reporte de calificaciones
- `GET /attendance` - Reporte de asistencia
- `GET /student/:id` - Reporte del estudiante
- `GET /bulletin/student/:id` - Boletín de notas
- `POST /custom` - Reporte personalizado

### 📋 Dashboard (`/api/dashboard`)
- `GET /` - Dashboard general (según rol)
- `GET /admin` - Dashboard de administrador
- `GET /teacher` - Dashboard de profesor
- `GET /student` - Dashboard de estudiante
- `GET /stats/system` - Estadísticas del sistema

### 🏛️ Institutos (`/api/institutes`)
- `GET /` - Listar institutos (super admin)
- `POST /` - Crear instituto (super admin)
- `GET /current/info` - Info del instituto actual
- `GET /current/config` - Configuración actual
- `GET /subdomain/:subdomain` - Instituto por subdominio

## 🛡️ Middleware de Seguridad

Todas las rutas implementan los siguientes middleware:

### 🔐 Autenticación
- `authenticate` - Verificar token JWT válido
- `optionalAuthenticate` - Autenticación opcional

### 🔑 Autorización
- `requireAdmin` - Solo administradores
- `requireTeacher` - Profesores y administradores
- `requireStudent` - Solo estudiantes
- `requireTutor` - Solo tutores
- `requireSelfOrAdmin` - Acceso a datos propios o admin

### ✅ Validación
- `validateBody` - Validar cuerpo de la petición
- `validateParams` - Validar parámetros de ruta
- `validateQuery` - Validar parámetros de consulta
- `validateCUID` - Validar formato de ID

### 🏢 Multitenancy
- `identifyTenant` - Identificar instituto
- `requireTenantAccess` - Verificar acceso al instituto
- `applyTenantContext` - Aplicar contexto del instituto

## 📝 Esquemas de Validación

Cada ruta incluye esquemas JSON Schema para:
- **Request body** - Validación de datos de entrada
- **Query parameters** - Validación de filtros y paginación
- **Path parameters** - Validación de IDs en la URL
- **Response** - Definición de respuestas exitosas

## 🔧 Características Técnicas

### ✨ Funcionalidades
- **Paginación automática** en todas las listas
- **Filtros avanzados** por fechas, roles, estados
- **Búsqueda por texto** en campos relevantes
- **Ordenamiento** configurable
- **Exportación** en múltiples formatos (PDF, Excel, CSV)
- **Carga masiva** de datos
- **Auditoría** de todas las acciones

### 🚀 Rendimiento
- **Cache Redis** para consultas frecuentes
- **Lazy loading** de relaciones
- **Índices optimizados** en base de datos
- **Rate limiting** por IP y usuario
- **Connection pooling** para base de datos

### 🔒 Seguridad
- **Validación estricta** de todos los inputs
- **Sanitización** de datos de entrada
- **Prevención de SQL injection**
- **Validación de CUID** para IDs
- **Headers de seguridad**
- **Logs de auditoría**

## 🎯 Convenciones de API

### 📤 Respuestas Exitosas
```json
{
  "success": true,
  "message": "Operación exitosa",
  "data": { ... },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

### ❌ Respuestas de Error
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Datos inválidos",
  "details": [
    {
      "field": "email",
      "message": "Email inválido"
    }
  ]
}
```

### 🔢 Códigos de Estado HTTP
- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `429` - Too Many Requests
- `500` - Internal Server Error

## 🚀 Uso

Para usar las rutas en tu aplicación Fastify:

```typescript
import { registerRoutes } from './routes';

// En tu servidor principal
await registerRoutes(fastify);
```

O importar rutas individuales:

```typescript
import { authRoutes, usersRoutes } from './routes';

await fastify.register(authRoutes, { prefix: '/api/auth' });
await fastify.register(usersRoutes, { prefix: '/api/users' });
```

## 📚 Documentación Adicional

- **Swagger UI**: `/documentation` - Documentación interactiva
- **Postman Collection**: Disponible en `/docs/postman/`
- **API Health**: `/api/health` - Estado del sistema
- **API Info**: `/api` - Información general de la API

---

**💡 Tip**: Todas las rutas están completamente documentadas con esquemas OpenAPI y pueden ser probadas desde la interfaz Swagger en `/documentation`.
