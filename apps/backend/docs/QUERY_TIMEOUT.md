# ⚙️ Configuración de Query Timeout en PostgreSQL

## 📝 Descripción

Para prevenir que queries lentas bloqueen el servidor, se recomienda configurar timeouts a nivel de PostgreSQL.

## 🔧 Configuración Recomendada

### Opción 1: En la URL de Conexión (Recomendado)

Agregar parámetros de timeout directamente en `DATABASE_URL`:

```env
# .env
DATABASE_URL="postgresql://user:password@localhost:5432/dbname?connect_timeout=10&statement_timeout=10000"
```

**Parámetros**:
- `connect_timeout=10` - Timeout de conexión (10 segundos)
- `statement_timeout=10000` - Timeout de query (10,000 ms = 10 segundos)

### Opción 2: Configuración Global en PostgreSQL

Ejecutar en PostgreSQL:

```sql
-- Timeout global de 10 segundos para todas las queries
ALTER DATABASE your_database_name SET statement_timeout = '10s';

-- O para un usuario específico
ALTER ROLE your_user_name SET statement_timeout = '10s';
```

### Opción 3: Configuración por Sesión

En `database.ts`, agregar después de conectar:

```typescript
await prisma.$executeRaw`SET statement_timeout = '10s'`;
```

## ✅ Beneficios

- ✅ Previene queries infinitas que bloquean el servidor
- ✅ Mejora la experiencia del usuario (error rápido vs espera infinita)
- ✅ Facilita debugging de queries lentas
- ✅ Protege contra ataques DoS basados en queries pesadas

## ⚠️ Consideraciones

- **Ajustar según necesidad**: 10 segundos es un buen default, pero puede necesitar ajuste
- **Queries pesadas legítimas**: Algunas operaciones (reportes, migraciones) pueden necesitar más tiempo
- **Monitoreo**: Usar el query monitor existente para identificar queries lentas

## 🔍 Verificar Configuración

```typescript
// En cualquier controlador, verificar timeout actual:
const result = await prisma.$queryRaw`SHOW statement_timeout`;
console.log('Current timeout:', result);
```

## 📊 Valores Recomendados por Tipo de Query

| Tipo de Query | Timeout Recomendado |
|---------------|---------------------|
| Lecturas simples | 2-5 segundos |
| Escrituras | 5-10 segundos |
| Reportes | 30-60 segundos |
| Migraciones | Sin límite |

## 🚀 Implementación Actual

Actualmente configurado en:
- `apps/backend/src/config/database.ts` - Configuración de Prisma
- Recomendación: Agregar `statement_timeout` en `DATABASE_URL`

## 📝 Ejemplo de DATABASE_URL Completa

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/school_db?schema=public&connect_timeout=10&statement_timeout=10000&pool_timeout=10"
```

**Parámetros adicionales útiles**:
- `pool_timeout=10` - Timeout para obtener conexión del pool
- `schema=public` - Schema por defecto
- `sslmode=require` - Requerir SSL en producción
