# Database Migration Scripts

Scripts para migrar de **Single Database** a **Database Per Tenant**.

## 📁 Estructura

```
src/migration/
├── types/
│   └── index.ts          # Tipos TypeScript
├── utils/
│   ├── database.ts       # Utilidades de base de datos
│   └── logger.ts         # Logger con colores
└── scripts/
    ├── 1-provision-databases.ts    # Provisioning de databases
    ├── 2-migrate-data.ts           # Migración de datos
    ├── 3-validate-migration.ts     # Validación
    └── 4-rollback-migration.ts     # Rollback
```

## 🚀 Uso

### Prerequisitos

1. **Configurar variables de entorno** en `.env`:

```env
# Source database (single database actual)
DATABASE_URL="postgresql://user:pass@localhost:5432/current_db"

# Platform database (metadata)
PLATFORM_DATABASE_URL="postgresql://user:pass@localhost:5432/platform_db"

# Template para tenant databases
TENANT_DATABASE_TEMPLATE="postgresql://user:pass@localhost:5432/template_db"
```

2. **Instalar dependencias**:

```bash
npm install
```

### Paso 1: Provisioning de Databases

Crea Platform DB y Tenant DBs para todos los institutos:

```bash
# Dry run (no hace cambios)
npx ts-node src/migration/scripts/1-provision-databases.ts --dry-run --verbose

# Ejecución real
npx ts-node src/migration/scripts/1-provision-databases.ts --verbose
```

**Qué hace**:
- Crea Platform Database
- Crea una Tenant Database por cada instituto
- Ejecuta migraciones Prisma en cada database
- Valida conectividad

### Paso 2: Migración de Datos

Migra datos de single database a Platform + Tenant DBs:

```bash
# Dry run
npx ts-node src/migration/scripts/2-migrate-data.ts --dry-run --verbose

# Ejecución real (batch size 1000)
npx ts-node src/migration/scripts/2-migrate-data.ts --batch-size=1000 --verbose

# Batch size más pequeño para databases grandes
npx ts-node src/migration/scripts/2-migrate-data.ts --batch-size=500
```

**Qué hace**:
- Migra metadata a Platform DB (Institute, SuperAdmin, etc.)
- Migra datos de cada tenant a su database
- Procesa en batches para evitar memory issues
- Valida conteos de registros

### Paso 3: Validación

Valida integridad de datos después de la migración:

```bash
npx ts-node src/migration/scripts/3-validate-migration.ts --verbose
```

**Qué hace**:
- Compara conteos de registros entre source y target
- Detecta datos faltantes o huérfanos
- Genera reporte detallado con issues

### Paso 4: Rollback (si es necesario)

⚠️ **CUIDADO**: Esto elimina TODAS las databases migradas!

```bash
# Requiere --confirm para evitar ejecuciones accidentales
npx ts-node src/migration/scripts/4-rollback-migration.ts --confirm
```

**Qué hace**:
- Elimina todas las Tenant Databases
- Elimina Platform Database
- Útil para testing o rollback completo

## 📊 Flags Disponibles

- `--dry-run`: Simula la ejecución sin hacer cambios
- `--verbose`: Muestra logs detallados
- `--batch-size=N`: Tamaño de batch para migración (default: 1000)
- `--confirm`: Confirma operaciones destructivas (rollback)

## 🔍 Ejemplo Completo

```bash
# 1. Test en dry-run
npx ts-node src/migration/scripts/1-provision-databases.ts --dry-run
npx ts-node src/migration/scripts/2-migrate-data.ts --dry-run

# 2. Ejecución real
npx ts-node src/migration/scripts/1-provision-databases.ts --verbose
npx ts-node src/migration/scripts/2-migrate-data.ts --batch-size=1000 --verbose

# 3. Validación
npx ts-node src/migration/scripts/3-validate-migration.ts --verbose

# 4. Si algo sale mal, rollback
npx ts-node src/migration/scripts/4-rollback-migration.ts --confirm
```

## ⚠️ Consideraciones Importantes

### Antes de Migrar

1. **Backup completo** de la base de datos actual
2. **Verificar espacio en disco** (necesitarás ~2x el tamaño actual)
3. **Notificar usuarios** de ventana de mantenimiento
4. **Testing en staging** primero

### Durante la Migración

1. **Activar modo mantenimiento** en la aplicación
2. **Monitorear logs** en tiempo real
3. **No interrumpir** el proceso de migración
4. **Verificar conectividad** a todas las databases

### Después de Migrar

1. **Ejecutar validación** completa
2. **Testing smoke** de funcionalidades críticas
3. **Monitorear performance** (24-48h)
4. **Mantener backup** por al menos 1 semana

## 🐛 Troubleshooting

### Error: "Connection refused"

- Verificar que PostgreSQL esté corriendo
- Verificar credenciales en `.env`
- Verificar firewall/network

### Error: "Database already exists"

- Normal si re-ejecutas el script
- El script hace `upsert` automáticamente
- Para empezar de cero, ejecuta rollback primero

### Error: "Out of memory"

- Reducir `--batch-size` (ej: 500 o 250)
- Aumentar memoria disponible para Node.js:
  ```bash
  NODE_OPTIONS="--max-old-space-size=4096" npx ts-node ...
  ```

### Validación falla con mismatches

- Revisar logs detallados con `--verbose`
- Verificar que no haya datos creados durante la migración
- Re-ejecutar migración para el tenant específico

## 📝 Logs

Los scripts generan logs detallados con:
- ✓ Operaciones exitosas (verde)
- ✗ Errores (rojo)
- ⚠ Warnings (amarillo)
- ℹ Información (azul)
- Progress bars para operaciones largas
- Tablas de resumen

## 🔐 Seguridad

- **Nunca** commitear `.env` con credenciales reales
- Usar **variables de entorno** en producción
- **Rotar credenciales** después de la migración
- **Limitar acceso** a scripts de migración

## 📞 Soporte

Si encuentras problemas:
1. Revisar logs con `--verbose`
2. Verificar configuración en `.env`
3. Ejecutar validación para identificar issues
4. Contactar al equipo de desarrollo
