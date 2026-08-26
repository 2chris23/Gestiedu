<div align="center">

# 🎓 Sistema de Gestión Escolar

**Sistema completo de gestión académica para instituciones educativas**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4-blue)](https://www.fastify.io/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748)](https://www.prisma.io/)

[Características](#-características) •
[Instalación](#-instalación) •
[Uso](#-uso) •
[Documentación](#-documentación) •
[Contribuir](#-contribuir)

</div>

---

## 📸 Vista Previa

> Sistema moderno y completo para la gestión académica de instituciones educativas

### Dashboard Principal
- Vista general con estadísticas en tiempo real
- Gestión de usuarios, aulas y materias
- Control de asistencia y calificaciones

### Gestión de Estudiantes
- Perfiles completos con historial académico
- Seguimiento de calificaciones por período
- Control de asistencia con justificaciones

### Horarios y Actividades
- Horarios visuales por aula
- Gestión de tareas, exámenes y proyectos
- Calendario académico integrado

---

## ✨ Características

### 👥 Gestión de Usuarios
- **Roles**: Administradores, Profesores, Estudiantes y Tutores
- Perfiles personalizables con avatares
- Control de acceso basado en roles
- Historial de actividad

### 📚 Gestión Académica
- **Ciclos Escolares**: Múltiples años académicos con estados (Activo, Completado, Próximo)
- **Períodos**: División del año en lapsos/trimestres
- **Aulas**: Organización por grado y sección
- **Materias**: Asignación flexible a aulas
- **Horarios**: Gestión visual de horarios por aula

### 📊 Calificaciones y Evaluaciones
- Registro de calificaciones por período
- Actividades (Tareas, Exámenes, Proyectos)
- Cálculo automático de promedios
- Estadísticas académicas por estudiante

### 📅 Control de Asistencia
- Registro diario de asistencia
- Estados: Presente, Ausente, Tardanza, Justificado
- Justificaciones con documentos adjuntos
- Reportes de asistencia

### 📈 Dashboard y Reportes
- Estadísticas en tiempo real
- Gráficos interactivos
- Exportación de datos
- Vista por rol (Admin, Profesor, Estudiante)

### 🔔 Notificaciones
- Sistema de notificaciones en tiempo real
- Alertas de actividades próximas
- Recordatorios de tareas

---

## 🚀 Instalación

### Requisitos Previos

- **Node.js** 18.0.0 o superior
- **npm** 9.0.0 o superior
- **Git** (para clonar el repositorio)

### Instalación Rápida

1. **Clona el repositorio**
   ```bash
   git clone https://github.com/2chris34/Cristian.git
   cd SISTEMA-DE-GESTION-ESCOLAR
   ```

2. **Ejecuta el script de inicio**
   
   **PowerShell (Recomendado):**
   ```powershell
   .\inicio.ps1
   ```
   
   **CMD:**
   ```cmd
   .\inicio.bat
   ```

3. **Selecciona la opción [2] Setup Completo**
   - Instalará todas las dependencias
   - Configurará la base de datos
   - Generará datos de prueba
   - Iniciará el sistema automáticamente

4. **¡Listo!** El sistema estará disponible en:
   - **Frontend**: http://localhost:3000
   - **Backend API**: http://localhost:3001
   - **API Docs**: http://localhost:3001/docs

### Credenciales de Acceso

**Administrador:**
- Email: `admin@institutodemo.edu`
- Password: `123456`

**Profesor:**
- Email: `maria.gonzalez@institutodemo.edu`
- Password: `123456`

**Estudiante:**
- Email: `pedro.ramirez@institutodemo.edu`
- Password: `123456`

---

## 📋 Uso

### Menú de Inicio

```
===================================================
  SISTEMA DE GESTION ESCOLAR
===================================================

  [1] Inicio Rápido (dev)
      └─ Inicia el sistema (uso diario)

  [2] Setup Completo
      └─ Instala dependencias y configura todo

  [3] Reset Base de Datos
      └─ Elimina y recrea la base de datos

  [4] Solo Instalar Dependencias
      └─ npm install en todos los workspaces

  [5] Solo Configurar Prisma
      └─ Genera cliente y sincroniza BD

  [0] Salir
===================================================
```

### Uso Diario

1. Ejecuta `.\inicio.ps1` o `.\inicio.bat`
2. Selecciona **[1] Inicio Rápido**
3. Accede a http://localhost:3000

### Comandos Manuales

```bash
# Instalar dependencias
npm install

# Iniciar desarrollo
npm run dev

# Build para producción
npm run build

# Iniciar producción
npm start

# Resetear base de datos
cd apps/backend
npx prisma migrate reset
```

---

## 🛠️ Tecnologías

### Frontend
- **Framework**: Next.js 14 (App Router)
- **UI**: React 18, TailwindCSS
- **Estado**: Zustand
- **Queries**: TanStack Query (React Query)
- **Formularios**: React Hook Form
- **Gráficos**: Recharts
- **Iconos**: Lucide React

### Backend
- **Framework**: Fastify 4
- **ORM**: Prisma 5
- **Base de Datos**: SQLite (desarrollo), PostgreSQL (producción)
- **Autenticación**: JWT
- **Validación**: Zod
- **WebSockets**: Socket.io
- **Caché**: Redis (opcional)

### DevOps
- **Monorepo**: Turborepo
- **Contenedores**: Docker & Docker Compose
- **CI/CD**: GitHub Actions
- **Linting**: ESLint
- **Formatting**: Prettier

---

## � Estructura del Proyecto

```
SISTEMA-DE-GESTION-ESCOLAR/
├── apps/
│   ├── backend/              # API Fastify
│   │   ├── src/
│   │   │   ├── controllers/  # Controladores de rutas
│   │   │   ├── services/     # Lógica de negocio
│   │   │   ├── routes/       # Definición de rutas
│   │   │   ├── middlewares/  # Middlewares
│   │   │   └── prisma/       # Schema y migraciones
│   │   └── scripts/          # Scripts de utilidad
│   │
│   ├── web/                  # Frontend Next.js
│   │   ├── src/
│   │   │   ├── app/          # App Router (páginas)
│   │   │   ├── components/   # Componentes React
│   │   │   ├── services/     # Servicios API
│   │   │   ├── hooks/        # Custom hooks
│   │   │   ├── store/        # Estado global
│   │   │   └── types/        # TypeScript types
│   │   └── public/           # Archivos estáticos
│   │
│   └── mobile/               # App React Native (futuro)
│
├── packages/                 # Paquetes compartidos
│   ├── shared/              # Código compartido
│   └── config/              # Configuraciones compartidas
│
├── docker/                   # Configuración Docker
│   ├── backend/
│   ├── web/
│   └── nginx/
│
├── docs/                     # Documentación
│   ├── api/                 # Documentación de API
│   ├── development/         # Guías de desarrollo
│   └── user/                # Manuales de usuario
│
├── scripts/                  # Scripts de utilidad
│   ├── backup.sh
│   ├── deploy.sh
│   └── migrate.sh
│
├── .github/                  # GitHub templates y workflows
│   ├── workflows/           # GitHub Actions
│   └── ISSUE_TEMPLATE/      # Templates de issues
│
├── inicio.ps1               # Script de inicio (PowerShell)
├── inicio.bat               # Script de inicio (CMD)
├── docker-compose.yml       # Docker Compose
├── turbo.json               # Configuración Turborepo
└── package.json             # Dependencias raíz
```

---

## 📚 Documentación

### Para Usuarios
- [Manual de Administrador](./docs/user/admin-guide.md)
- [Manual de Profesor](./docs/user/teacher-guide.md)
- [Manual de Estudiante](./docs/user/student-guide.md)
- [Manual de Tutor](./docs/user/parent-guide.md)

### Para Desarrolladores
- [Guía de Configuración](./docs/development/setup.md)
- [Arquitectura del Sistema](./docs/development/architecture.md)
- [Guía de Contribución](./CONTRIBUTING.md)
- [Testing](./docs/development/testing.md)

### API
- [Endpoints](./docs/api/endpoints.md)
- [Autenticación](./docs/api/authentication.md)
- [Schemas](./docs/api/schemas.md)
- [WebSockets](./docs/api/websockets.md)

### Deployment
- [Docker](./docs/deployment/docker.md)
- [AWS](./docs/deployment/aws.md)
- [Railway](./docs/deployment/railway.md)

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Por favor lee la [Guía de Contribución](./CONTRIBUTING.md) para más detalles.

### Proceso de Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

### Reportar Bugs

Si encuentras un bug, por favor [abre un issue](https://github.com/2chris34/Cristian/issues/new?template=bug_report.md) con los detalles.

### Solicitar Funcionalidades

Para solicitar nuevas funcionalidades, [abre un issue](https://github.com/2chris34/Cristian/issues/new?template=feature_request.md) describiendo tu idea.

---

## � Changelog

Ver [CHANGELOG.md](./CHANGELOG.md) para un historial detallado de cambios.

---

## �📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](./LICENSE) para más detalles.

---

## 👨‍💻 Autor

**Sistema de Gestión Escolar**

- GitHub: [@2chris34](https://github.com/2chris34)
- Repositorio: [Cristian](https://github.com/2chris34/Cristian)

---

## 🙏 Agradecimientos

- Next.js por el excelente framework
- Fastify por la velocidad y simplicidad
- Prisma por el ORM moderno
- La comunidad open source

---

<div align="center">

**[⬆ Volver arriba](#-sistema-de-gestión-escolar)**

Hecho con ❤️ para instituciones educativas

</div>
