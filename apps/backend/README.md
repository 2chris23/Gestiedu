# 🏫 Backend - Sistema de Gestión Escolar

Backend API completo para el Sistema de Gestión Escolar desarrollado con **Fastify**, **Prisma**, **PostgreSQL**, **Redis** y **Socket.io**.

## 🚀 Inicio Rápido

### Configuración Automática
```bash
# Ejecutar el script de configuración automática
npm run setup
```

Este comando verificará dependencias, instalará paquetes, creará archivos de configuración y preparará la base de datos.

### Configuración Manual

#### 1. Prerrequisitos
- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- **PostgreSQL** >= 14.0
- **Redis** >= 6.0 (opcional para desarrollo)

#### 2. Instalación
```bash
# Instalar dependencias
npm install

# Copiar archivo de configuración
cp .env.example .env
```

#### 3. Configurar Variables de Entorno
Edita el archivo `.env` con tus configuraciones:

```bash
# Entorno
NODE_ENV=development
PORT=3001

# Base de datos PostgreSQL
DATABASE_URL="postgresql://usuario:contraseña@localhost:5432/gestion_escolar?schema=public"

# Redis (opcional para desarrollo)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT (¡CAMBIA ESTO!)
JWT_SECRET=tu_jwt_secret_super_seguro_de_al_menos_32_caracteres
```

#### 4. Configurar Base de Datos
```bash
# Generar cliente Prisma
npm run db:generate

# Aplicar migraciones y sembrar datos
npm run db:setup
```

#### 5. Iniciar Servidor
```bash
# Desarrollo (con hot reload)
npm run dev

# Producción
npm run build && npm start
```

## 📚 Documentación API

Una vez iniciado el servidor, la documentación estará disponible en:
- **Swagger UI**: http://localhost:3001/documentation
- **Health Check**: http://localhost:3001/health

## 🔐 Credenciales de Prueba

Después de ejecutar el seed, tendrás acceso con estas credenciales:

### 👑 Administrador
- **Email**: admin@institutodemo.edu
- **Cédula**: 12345678
- **Contraseña**: 123456

### 👨‍🏫 Profesores
- **María Elena**: maria.gonzalez@institutodemo.edu (Cédula: 23456789)
- **Carlos Andrés**: carlos.martinez@institutodemo.edu (Cédula: 34567890)
- **Ana Patricia**: ana.lopez@institutodemo.edu (Cédula: 45678901)

### 👨‍🎓 Estudiantes
- **Pedro José**: pedro.silva@estudiante.edu (Cédula: 56789012)
- **Sofía Alejandra**: sofia.ramirez@estudiante.edu (Cédula: 67890123)
- **Diego Alejandro**: diego.morales@estudiante.edu (Cédula: 78901234)
- **Valentina María**: valentina.torres@estudiante.edu (Cédula: 89012345)

### 👨‍👩‍👧‍👦 Tutores
- **Ricardo Antonio**: ricardo.silva@tutor.com (Cédula: 90123456)
- **Carmen Elena**: carmen.ramirez@tutor.com (Cédula: 01234567)

## 📁 Estructura del Proyecto

```
src/
├── config/          # Configuraciones (DB, Redis, JWT, etc.)
├── controllers/     # Controladores de las rutas
├── dto/            # Data Transfer Objects y validaciones
├── middleware/     # Middlewares (auth, errores, etc.)
├── plugins/        # Plugins de Fastify
├── prisma/         # Esquema y migraciones de base de datos
├── routes/         # Definición de rutas
├── services/       # Lógica de negocio
├── socket/         # Manejadores de WebSocket
├── types/          # Tipos TypeScript
└── utils/          # Utilidades y helpers
```

## 🛠️ Scripts Disponibles

### Desarrollo
```bash
npm run dev              # Iniciar en modo desarrollo
npm run build            # Compilar TypeScript
npm start                # Iniciar servidor compilado
npm run start:prod       # Iniciar en modo producción
```

### Base de Datos
```bash
npm run db:generate      # Generar cliente Prisma
npm run db:push          # Aplicar cambios al esquema
npm run db:migrate       # Crear y aplicar migración
npm run db:seed          # Poblar con datos de prueba
npm run db:studio        # Abrir Prisma Studio
npm run db:setup         # Configuración completa de BD
npm run db:reset         # Resetear BD completamente
```

### Testing
```bash
npm test                 # Ejecutar tests
npm run test:watch       # Tests en modo watch
npm run test:coverage    # Tests con cobertura
npm run test:e2e         # Tests end-to-end
```

### Código
```bash
npm run lint             # Verificar código
npm run lint:fix         # Corregir problemas automáticamente
npm run format           # Formatear código
```

### Docker
```bash
npm run docker:dev       # Levantar servicios de desarrollo
npm run docker:prod      # Levantar servicios de producción
npm run docker:down      # Parar servicios
npm run docker:logs      # Ver logs de contenedores
```

## 🏗️ Arquitectura

### Stack Tecnológico
- **Framework**: Fastify 4.x
- **ORM**: Prisma 5.x
- **Base de Datos**: PostgreSQL
- **Caché**: Redis
- **Tiempo Real**: Socket.io
- **Autenticación**: JWT + bcrypt
- **Validación**: Zod
- **Logging**: Winston

### Características Principales

#### 🔒 Autenticación y Autorización
- JWT con refresh tokens
- Middleware de autenticación
- Control de roles (ADMIN, TEACHER, STUDENT, TUTOR)
- Sesiones persistentes con Redis

#### ⚡ Tiempo Real
- Socket.io para actualizaciones en vivo
- Adaptador Redis para escalabilidad
- Eventos automáticos para cambios de datos

#### 🛡️ Seguridad
- Rate limiting
- CORS configurado
- Helmet para headers de seguridad
- Validación de entrada con Zod
- Hash seguro de contraseñas con bcrypt

#### 📊 Sistema de Calificaciones
- Escala 0-20 puntos
- Cálculo automático de promedios
- Promedios por materia y globales
- Promedios de clase

## 🌐 Endpoints Principales

### Autenticación
```
POST   /api/auth/login              # Iniciar sesión
POST   /api/auth/refresh            # Renovar token
POST   /api/auth/logout             # Cerrar sesión
GET    /api/auth/profile            # Obtener perfil
PUT    /api/auth/password           # Cambiar contraseña
```

### Usuarios
```
GET    /api/users                   # Listar usuarios
POST   /api/users                   # Crear usuario
GET    /api/users/:id               # Obtener usuario
PUT    /api/users/:id               # Actualizar usuario
DELETE /api/users/:id               # Eliminar usuario
```

### Aulas
```
GET    /api/classrooms              # Listar aulas
POST   /api/classrooms              # Crear aula
GET    /api/classrooms/:id          # Obtener aula
PUT    /api/classrooms/:id          # Actualizar aula
GET    /api/classrooms/:id/students # Estudiantes del aula
```

### Actividades
```
GET    /api/activities              # Listar actividades
POST   /api/activities              # Crear actividad
GET    /api/activities/:id          # Obtener actividad
PUT    /api/activities/:id          # Actualizar actividad
DELETE /api/activities/:id          # Eliminar actividad
```

### Calificaciones
```
GET    /api/grades                  # Listar calificaciones
POST   /api/grades                  # Crear calificación
PUT    /api/grades/:id              # Actualizar calificación
GET    /api/grades/student/:id      # Calificaciones de estudiante
GET    /api/grades/averages/:id     # Promedios de estudiante
```

### Asistencia
```
GET    /api/attendance              # Registros de asistencia
POST   /api/attendance              # Registrar asistencia
PUT    /api/attendance/:id          # Actualizar asistencia
GET    /api/attendance/student/:id  # Asistencia de estudiante
```

## 🔧 Configuración Avanzada

### Variables de Entorno Completas

```bash
# Servidor
NODE_ENV=development
PORT=3001

# Base de datos
DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_URL="redis://localhost:6379"  # URL completa (opcional)

# JWT
JWT_SECRET=super_secret_key_at_least_32_characters_long
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_TIME_WINDOW=60000

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_email@gmail.com
SMTP_PASS=tu_password_de_aplicacion
SMTP_FROM="Sistema Escolar <noreply@tudominio.com>"

# Archivos
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# Logging
LOG_LEVEL=info
```

### Configuración de Desarrollo con Docker

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: gestion_escolar_dev
      POSTGRES_USER: developer
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data

volumes:
  postgres_dev_data:
  redis_dev_data:
```

## 📈 Monitoreo y Logging

### Health Check
```bash
curl http://localhost:3001/health
```

Respuesta:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": "development",
  "version": "1.0.0",
  "database": "connected",
  "redis": "connected"
}
```

### Logs
Los logs se almacenan en la carpeta `logs/` con diferentes niveles:
- `error.log` - Solo errores
- `combined.log` - Todos los logs
- Consola - Logs de desarrollo

## 🚨 Troubleshooting

### Problemas Comunes

#### Base de Datos no Conecta
```bash
# Verificar que PostgreSQL esté corriendo
sudo service postgresql start

# Verificar conexión
psql -h localhost -U tu_usuario -d gestion_escolar
```

#### Redis no Conecta
```bash
# Verificar que Redis esté corriendo
redis-cli ping

# Si no está instalado
sudo apt install redis-server  # Ubuntu/Debian
brew install redis            # macOS
```

#### Errores de Prisma
```bash
# Regenerar cliente
npm run db:generate

# Resetear base de datos
npm run db:reset
```

#### Problemas de Permisos
```bash
# Dar permisos al directorio uploads
chmod -R 755 uploads/

# Verificar permisos de Node.js
node -v && npm -v
```

### Depuración

#### Habilitar Logs Detallados
```bash
LOG_LEVEL=debug npm run dev
```

#### Usar Prisma Studio
```bash
npm run db:studio
```

#### Verificar Socket.io
Abre la consola del navegador y conecta:
```javascript
const socket = io('http://localhost:3001');
socket.on('connect', () => console.log('Conectado'));
```

## 🧪 Testing

### Ejecutar Tests
```bash
# Tests unitarios
npm test

# Tests con cobertura
npm run test:coverage

# Tests específicos
npm test -- --testNamePattern="AuthService"
```

### Estructura de Tests
```
tests/
├── unit/              # Tests unitarios
├── integration/       # Tests de integración
├── e2e/              # Tests end-to-end
└── fixtures/         # Datos de prueba
```

## 🚀 Deployment

### Construcción para Producción
```bash
npm run build
```

### Variables de Producción
```bash
NODE_ENV=production
DATABASE_URL="postgresql://prod_user:prod_pass@prod_host:5432/prod_db"
JWT_SECRET="production_secret_super_secure_32_characters_minimum"
REDIS_URL="redis://prod_redis:6379"
```

### Docker Production
```bash
docker build -t gestion-escolar-backend .
docker run -p 3001:3001 gestion-escolar-backend
```

## 📞 Soporte

### Recursos
- **Documentación Completa**: `/docs/`
- **Ejemplos de API**: `/docs/api/examples.md`
- **Guía de Desarrollo**: `/docs/development/setup.md`

### Contacto
Para soporte técnico o preguntas sobre implementación, consulta la documentación completa en la carpeta `docs/` del proyecto.

---

**¿Todo listo?** 🎉

Ejecuta `npm run setup` y en pocos minutos tendrás un backend completo funcionando con datos de prueba listos para usar.
