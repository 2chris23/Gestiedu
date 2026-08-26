# Deployment Guide - Database Per Tenant Migration

## 🎯 Overview

This guide provides step-by-step instructions for deploying the Database Per Tenant migration in production.

**Estimated Time**: 4-6 hours  
**Downtime**: 2-4 hours  
**Team Required**: 2-3 people (DBA, Backend Dev, DevOps)

---

## 📋 Pre-Deployment Checklist

### 1 Week Before

- [ ] **Review migration plan** with entire team
- [ ] **Schedule maintenance window** (off-peak hours)
- [ ] **Notify users** via email/in-app notification
- [ ] **Prepare rollback plan** and test it
- [ ] **Set up monitoring** and alerting
- [ ] **Provision staging environment** identical to production
- [ ] **Run full migration in staging**
- [ ] **Validate staging results**
- [ ] **Document any issues** found in staging

### 1 Day Before

- [ ] **Final backup** of production database
- [ ] **Verify backup** can be restored
- [ ] **Test database connectivity** from application servers
- [ ] **Confirm team availability** during maintenance window
- [ ] **Prepare communication templates** (start, progress, completion)
- [ ] **Set up war room** (Slack channel, video call, etc.)
- [ ] **Review runbook** with entire team

### 2 Hours Before

- [ ] **Send "maintenance starting soon" notification** to users
- [ ] **Verify all team members** are available
- [ ] **Open war room** communication channels
- [ ] **Final check** of all scripts and tools
- [ ] **Verify backup** is recent and valid

---

## 🚀 Deployment Steps

### Phase 1: Preparation (30 minutes)

#### 1.1 Enable Maintenance Mode

```bash
# Set maintenance mode in application
# This should prevent new writes to database
npm run maintenance:enable
```

#### 1.2 Verify No Active Users

```bash
# Check active sessions
# Wait for users to log out or force logout
npm run sessions:check
```

#### 1.3 Final Backup

```bash
# Create final backup before migration
npx ts-node src/migration/scripts/backup-database.ts \
  --output=/backups/pre-migration-$(date +%Y%m%d-%H%M%S).sql
```

**Verify backup**:
```bash
# Check backup file exists and has reasonable size
ls -lh /backups/pre-migration-*.sql
```

#### 1.4 Pre-flight Checks

```bash
# Run pre-flight checks
npx ts-node src/migration/scripts/0-preflight-checks.ts
```

**Expected**: All critical checks should pass.

---

### Phase 2: Provisioning (30-60 minutes)

#### 2.1 Dry Run

```bash
# Test provisioning in dry-run mode
npx ts-node src/migration/scripts/1-provision-databases.ts \
  --dry-run --verbose
```

**Review output** for any errors or warnings.

#### 2.2 Actual Provisioning

```bash
# Provision Platform DB and Tenant DBs
npx ts-node src/migration/scripts/1-provision-databases.ts \
  --verbose 2>&1 | tee logs/provisioning-$(date +%Y%m%d-%H%M%S).log
```

**Monitor**:
- Progress bars for each tenant database
- Any error messages
- Total time taken

**Expected**:
- Platform database created
- One tenant database per institute
- All migrations applied successfully

#### 2.3 Verify Provisioning

```bash
# Check that all databases were created
psql -h $DB_HOST -U $DB_USER -l | grep tenant_
```

---

### Phase 3: Data Migration (1-3 hours)

#### 3.1 Dry Run

```bash
# Test migration in dry-run mode
npx ts-node src/migration/scripts/2-migrate-data.ts \
  --dry-run --batch-size=1000 --verbose
```

**Review output** for estimated time and any warnings.

#### 3.2 Actual Migration

```bash
# Migrate data with appropriate batch size
npx ts-node src/migration/scripts/2-migrate-data.ts \
  --batch-size=1000 --verbose 2>&1 | tee logs/migration-$(date +%Y%m%d-%H%M%S).log
```

**Monitor**:
- Progress for each tenant
- Record counts for each model
- Any mismatches or errors
- Memory usage

**Adjust batch size** if needed:
- Large datasets: `--batch-size=500`
- Memory issues: `--batch-size=250`

**Expected**:
- Platform metadata migrated (Institute, SuperAdmin)
- All tenant data migrated
- Record counts match source

---

### Phase 4: Validation (30-60 minutes)

#### 4.1 Run Validation Script

```bash
# Validate data integrity
npx ts-node src/migration/scripts/3-validate-migration.ts \
  --verbose 2>&1 | tee logs/validation-$(date +%Y%m%d-%H%M%S).log
```

**Review**:
- All validations should pass
- No critical issues
- Investigate any warnings

#### 4.2 Manual Spot Checks

```sql
-- Check a few institutes manually
SELECT * FROM platform_db.institutes LIMIT 10;

-- Check tenant data
\c tenant_institute1
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM classrooms;
SELECT COUNT(*) FROM grades;
```

#### 4.3 Verify Relationships

```sql
-- Check that foreign keys are intact
SELECT COUNT(*) FROM grades WHERE student_id NOT IN (SELECT id FROM users);
-- Should return 0
```

---

### Phase 5: Application Update (30 minutes)

#### 5.1 Update Environment Variables

```bash
# Update .env to use new database configuration
# OLD:
# DATABASE_URL=postgresql://...

# NEW:
PLATFORM_DATABASE_URL=postgresql://...
# DATABASE_URL is now used as template for tenant DBs
```

#### 5.2 Deploy Updated Application

```bash
# Deploy new version with Database Per Tenant support
git pull origin main
npm install
npm run build
pm2 restart backend
```

#### 5.3 Verify Application Starts

```bash
# Check application logs
pm2 logs backend --lines 100

# Check health endpoint
curl http://localhost:3000/health
```

---

### Phase 6: Smoke Testing (30 minutes)

#### 6.1 Test Critical Flows

- [ ] **Login** (admin, teacher, student)
- [ ] **Tenant resolution** (subdomain, slug, custom domain)
- [ ] **Create operations** (user, classroom, grade)
- [ ] **Read operations** (lists, details)
- [ ] **Update operations** (edit user, edit grade)
- [ ] **Delete operations** (soft delete user)
- [ ] **Audit logs** (verify logs are created)
- [ ] **Cross-tenant isolation** (verify tenant A can't access tenant B data)

#### 6.2 Performance Check

```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/users

# Check database connections
SELECT count(*) FROM pg_stat_activity WHERE datname LIKE 'tenant_%';
```

---

### Phase 7: Go Live (15 minutes)

#### 7.1 Disable Maintenance Mode

```bash
# Disable maintenance mode
npm run maintenance:disable
```

#### 7.2 Notify Users

```
Subject: System Maintenance Complete

Dear Users,

The scheduled maintenance has been completed successfully. 
The system is now back online with improved performance and reliability.

Thank you for your patience.
```

#### 7.3 Monitor Closely

- [ ] **Watch error logs** for 1 hour
- [ ] **Monitor database connections**
- [ ] **Check response times**
- [ ] **Verify no data issues** reported by users

---

## 🚨 Rollback Procedure

If critical issues are found:

### Option 1: Rollback Application Only

```bash
# Revert to previous application version
git checkout <previous-commit>
npm install
npm run build
pm2 restart backend

# Restore old environment variables
# DATABASE_URL=postgresql://... (single database)
```

### Option 2: Full Rollback (Database + Application)

```bash
# 1. Enable maintenance mode
npm run maintenance:enable

# 2. Restore backup
pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME /backups/pre-migration-*.sql

# 3. Drop migrated databases
npx ts-node src/migration/scripts/4-rollback-migration.ts --confirm

# 4. Revert application
git checkout <previous-commit>
npm install
npm run build
pm2 restart backend

# 5. Disable maintenance mode
npm run maintenance:disable
```

---

## 📊 Post-Deployment

### First 24 Hours

- [ ] **Monitor error rates** continuously
- [ ] **Check database performance**
- [ ] **Verify audit logs** are being created
- [ ] **Respond to user reports** immediately
- [ ] **Document any issues** found

### First Week

- [ ] **Analyze performance metrics**
- [ ] **Optimize slow queries** if needed
- [ ] **Review database sizes** per tenant
- [ ] **Collect user feedback**
- [ ] **Update documentation** based on learnings

### After 1 Week

- [ ] **Delete old single database** (after confirming everything works)
- [ ] **Archive migration scripts** (keep for reference)
- [ ] **Conduct retrospective** with team
- [ ] **Document lessons learned**

---

## 📞 Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| DBA | | | |
| Backend Lead | | | |
| DevOps | | | |
| Product Manager | | | |

---

## 📝 Communication Templates

### Start of Maintenance

```
🔧 MAINTENANCE IN PROGRESS

We are currently performing scheduled maintenance to improve system performance.

Expected duration: 2-4 hours
Estimated completion: [TIME]

Thank you for your patience.
```

### Maintenance Complete

```
✅ MAINTENANCE COMPLETE

The scheduled maintenance has been completed successfully.
The system is now back online.

Thank you for your patience!
```

### Issue Detected

```
⚠️ MAINTENANCE UPDATE

We have encountered an issue during maintenance and are working to resolve it.

Updated estimated completion: [TIME]

We apologize for the inconvenience and appreciate your patience.
```

---

## ✅ Success Criteria

Migration is considered successful when:

- ✅ All validation checks pass
- ✅ Application starts without errors
- ✅ All critical user flows work
- ✅ Performance is acceptable (< 200ms p95)
- ✅ No data loss or corruption
- ✅ Audit logs are being created correctly
- ✅ Cross-tenant isolation is verified
- ✅ No critical errors in logs for 24 hours

---

## 🎓 Lessons Learned Template

After deployment, document:

1. **What went well?**
2. **What could be improved?**
3. **Unexpected issues encountered?**
4. **How were they resolved?**
5. **Recommendations for future migrations?**
