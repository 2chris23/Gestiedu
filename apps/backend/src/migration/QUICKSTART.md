# Migration Scripts - Quick Reference

## 🚀 Quick Start

```bash
# 1. Pre-flight checks
npm run migrate:preflight

# 2. Backup database
npm run migrate:backup

# 3. Provision databases (dry-run first)
npm run migrate:provision:dry
npm run migrate:provision

# 4. Migrate data (dry-run first)
npm run migrate:data:dry
npm run migrate:data

# 5. Validate migration
npm run migrate:validate

# 6. Rollback (if needed)
npm run migrate:rollback -- --confirm
```

## 📋 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run migrate:preflight` | Run pre-flight checks |
| `npm run migrate:backup` | Create database backup |
| `npm run migrate:provision` | Provision Platform + Tenant DBs |
| `npm run migrate:provision:dry` | Dry-run provisioning |
| `npm run migrate:data` | Migrate data |
| `npm run migrate:data:dry` | Dry-run data migration |
| `npm run migrate:validate` | Validate migration |
| `npm run migrate:rollback` | Rollback migration (requires --confirm) |
| `npm run migrate:test` | Test migration locally |

## 📚 Documentation

- [`README.md`](./README.md) - Full documentation
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) - Deployment guide

## ⚙️ Configuration

Create `.env` with:

```env
DATABASE_URL="postgresql://user:pass@host:5432/current_db"
PLATFORM_DATABASE_URL="postgresql://user:pass@host:5432/platform_db"
TENANT_DATABASE_TEMPLATE="postgresql://user:pass@host:5432/template"
```

See [`.env.migration.example`](../../.env.migration.example) for full template.
