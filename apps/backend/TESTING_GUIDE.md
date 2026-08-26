# 🧪 Guía de Testing - Sistema de Gestión Escolar

## 📋 Índice

1. [Instalación](#instalación)
2. [Configuración](#configuración)
3. [Ejecución de Tests](#ejecución-de-tests)
4. [Estructura de Tests](#estructura-de-tests)
5. [Escribir Nuevos Tests](#escribir-nuevos-tests)
6. [Troubleshooting](#troubleshooting)

---

## 🚀 Instalación

### 1. Instalar Dependencias

```bash
cd apps/backend
npm install
```

Esto instalará automáticamente:
- `jest` - Framework de testing
- `@types/jest` - Tipos de TypeScript
- `ts-jest` - Preset para TypeScript
- `supertest` - Testing de APIs
- `@types/supertest` - Tipos para Supertest
- `jest-mock-extended` - Mocking avanzado

### 2. Crear Base de Datos de Test

```bash
# Crear base de datos de test en PostgreSQL
createdb school_test

# O usando psql
psql -U postgres -c "CREATE DATABASE school_test;"
```

### 3. Ejecutar Migraciones en DB de Test

```bash
# Configurar DATABASE_URL temporalmente
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/school_test"

# Ejecutar migraciones
npm run db:migrate

# Volver a la DB normal
unset DATABASE_URL
```

---

## ⚙️ Configuración

### Archivo `.env.test`

Ya está creado con la configuración necesaria. Asegúrate de que:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/school_test"
JWT_SECRET="test-jwt-secret-key"
NODE_ENV=test
```

### Archivo `jest.config.js`

Ya está configurado con:
- ✅ Preset de TypeScript
- ✅ Cobertura de código
- ✅ Timeouts apropiados
- ✅ Module mapping

---

## 🏃 Ejecución de Tests

### Comandos Disponibles

```bash
# Ejecutar todos los tests
npm test

# Ejecutar tests en modo watch (re-ejecuta al cambiar archivos)
npm run test:watch

# Ejecutar tests con reporte de cobertura
npm run test:coverage

# Ejecutar un archivo específico
npm test -- tests/security.test.ts

# Ejecutar tests que coincidan con un patrón
npm test -- --testNamePattern="should return 401"

# Ejecutar tests en modo verbose
npm test -- --verbose

# Ejecutar tests con actualización de snapshots
npm test -- --updateSnapshot
```

### Ejemplos de Uso

```bash
# Solo tests de seguridad
npm test -- security

# Solo tests de horarios
npm test -- schedules

# Tests con cobertura y reporte HTML
npm run test:coverage
# Luego abrir: coverage/lcov-report/index.html
```

---

## 📁 Estructura de Tests

```
apps/backend/
├── tests/
│   ├── setup.ts              # Configuración global de tests
│   ├── helpers.ts            # Funciones auxiliares
│   ├── security.test.ts      # Tests de seguridad (Fase 1)
│   └── schedules.test.ts     # Tests de lógica escolar (Fase 2)
├── jest.config.js            # Configuración de Jest
└── .env.test                 # Variables de entorno para tests
```

---

## 📝 Tests Implementados

### 1. Tests de Seguridad (`security.test.ts`)

**Autenticación**:
- ✅ Rechaza acceso sin token (401)
- ✅ Rechaza token inválido (401)
- ✅ Rechaza acceso entre estudiantes (403)
- ✅ Permite acceso de admin a cualquier dashboard
- ✅ Permite acceso de estudiante a su propio dashboard

**Sanitización XSS**:
- ✅ Elimina tags `<script>`
- ✅ Elimina event handlers (`onerror`, `onclick`)
- ✅ Permite tags seguros (`<b>`, `<i>`, `<p>`)
- ✅ Elimina atributos peligrosos (`javascript:`)
- ✅ Maneja null/undefined correctamente

**Manejo de Errores**:
- ✅ Captura errores P2002 (duplicado)
- ✅ Retorna mensajes user-friendly
- ✅ Incluye códigos de error apropiados

**Validación de Contraseñas**:
- ✅ Rechaza contraseñas < 8 caracteres
- ✅ Acepta contraseñas >= 8 caracteres
- ✅ Calcula fortaleza correctamente

### 2. Tests de Horarios (`schedules.test.ts`)

**Creación de Horarios**:
- ✅ Crea horario en slot libre
- ✅ Rechaza horarios solapados (mismo profesor)
- ✅ Detecta solapamiento al inicio
- ✅ Detecta solapamiento al final
- ✅ Detecta solapamiento total
- ✅ Permite horarios en días diferentes
- ✅ Permite horarios consecutivos
- ✅ Rechaza mismo aula/hora (diferente profesor)

**Detalles de Conflictos**:
- ✅ Proporciona información detallada del conflicto
- ✅ Incluye día, hora y aula en el mensaje

---

## ✍️ Escribir Nuevos Tests

### Ejemplo: Test de Calificaciones

```typescript
import { createTestServer, cleanTestDatabase, createTestUser } from './helpers';

describe('Grades Tests', () => {
  let server: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    server = await createTestServer();
    prisma = server.prisma;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  it('should create a grade with sanitized comments', async () => {
    const { user: teacher, institute } = await createTestUser(prisma, UserRole.TEACHER);
    const token = generateTestToken(teacher.id, UserRole.TEACHER, institute.id);

    const response = await request(server.server)
      .post('/api/grades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        score: 15,
        comments: '<script>alert("XSS")</script>Excelente',
        studentId: 'student-id',
        activityId: 'activity-id',
      })
      .expect(201);

    expect(response.body.grade.comments).not.toContain('<script>');
    expect(response.body.grade.comments).toContain('Excelente');
  });
});
```

### Helpers Disponibles

```typescript
// Crear servidor de test
const server = await createTestServer();

// Limpiar base de datos
await cleanTestDatabase(prisma);

// Crear usuario de test
const { user, institute } = await createTestUser(prisma, UserRole.ADMIN);

// Generar token de autenticación
const token = generateTestToken(userId, role, instituteId);

// Crear datos de test
const academicYear = await createTestAcademicYear(prisma, instituteId);
const classroom = await createTestClassroom(prisma, academicYearId, instituteId);
const subject = await createTestSubject(prisma, instituteId);
const schedule = await createTestSchedule(prisma, scheduleData);
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module"

```bash
# Limpiar cache de Jest
npm test -- --clearCache

# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### Error: "Database connection failed"

```bash
# Verificar que PostgreSQL está corriendo
pg_isready

# Verificar que la DB de test existe
psql -U postgres -l | grep school_test

# Crear DB si no existe
createdb school_test

# Ejecutar migraciones
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/school_test" npm run db:migrate
```

### Error: "Timeout exceeded"

```typescript
// Aumentar timeout en el test específico
it('should do something slow', async () => {
  // ...
}, 30000); // 30 segundos

// O en jest.config.js
testTimeout: 30000
```

### Tests Fallan Aleatoriamente

```bash
# Ejecutar tests en serie (no en paralelo)
npm test -- --runInBand

# Limpiar DB antes de cada test
beforeEach(async () => {
  await cleanTestDatabase(prisma);
});
```

### Error: "Port already in use"

El servidor de test usa el mismo puerto que el de desarrollo. Opciones:

1. Detener el servidor de desarrollo antes de correr tests
2. Configurar puerto diferente en `.env.test`
3. Usar `--forceExit` en Jest

---

## 📊 Cobertura de Código

### Ver Reporte de Cobertura

```bash
# Generar reporte
npm run test:coverage

# Abrir reporte HTML
open coverage/lcov-report/index.html  # macOS
start coverage/lcov-report/index.html # Windows
xdg-open coverage/lcov-report/index.html # Linux
```

### Umbrales de Cobertura

Configurados en `jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    branches: 50,
    functions: 50,
    lines: 50,
    statements: 50
  }
}
```

---

## 🎯 Mejores Prácticas

### 1. Nombres Descriptivos

```typescript
// ❌ Mal
it('test 1', () => {});

// ✅ Bien
it('should return 401 when accessing protected route without token', () => {});
```

### 2. Arrange-Act-Assert

```typescript
it('should create a user', async () => {
  // Arrange (preparar)
  const userData = { email: 'test@test.com', ... };
  
  // Act (actuar)
  const response = await request(server.server)
    .post('/api/users')
    .send(userData);
  
  // Assert (verificar)
  expect(response.status).toBe(201);
  expect(response.body.user.email).toBe(userData.email);
});
```

### 3. Cleanup

```typescript
// Siempre limpiar después de cada test
beforeEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await server.close();
});
```

### 4. Aislamiento

```typescript
// Cada test debe ser independiente
// No depender del orden de ejecución
// No compartir estado entre tests
```

---

## 📚 Recursos

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

## ✅ Checklist de Testing

Antes de hacer commit:

- [ ] Todos los tests pasan (`npm test`)
- [ ] Cobertura >= 50% (`npm run test:coverage`)
- [ ] No hay warnings de Jest
- [ ] Tests son independientes (pasan en cualquier orden)
- [ ] Nombres de tests son descriptivos
- [ ] Se limpia la DB después de cada test

---

**¡Happy Testing! 🎉**
