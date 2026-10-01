-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InstituteStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING', 'INACTIVE', 'PROVISIONING', 'FAILED');

-- CreateTable
CREATE TABLE "super_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admin_refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "supportEmail" TEXT NOT NULL DEFAULT 'soporte@tuapp.com',
    "platformName" TEXT NOT NULL DEFAULT 'GestiEdu',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "slug" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "customDomain" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'development',
    "status" "InstituteStatus" NOT NULL DEFAULT 'PENDING',
    "trialEndsAt" TIMESTAMP(3),
    "notes" TEXT,
    "databaseName" TEXT,
    "databaseHost" TEXT,
    "databasePort" INTEGER DEFAULT 5432,
    "databaseUser" TEXT,
    "databasePassword" TEXT,
    "adminId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Caracas',
    "country" TEXT NOT NULL DEFAULT 'VE',
    "city" TEXT,
    "academicConfig" JSONB,
    "logo" TEXT,
    "favicon" TEXT,
    "primaryColor" TEXT DEFAULT '#4F46E5',
    "secondaryColor" TEXT DEFAULT '#3B82F6',
    "subjectPalette" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'BASIC',
    "maxStudents" INTEGER NOT NULL DEFAULT 2000,
    "maxTeachers" INTEGER NOT NULL DEFAULT 100,
    "maxStorage" INTEGER NOT NULL DEFAULT 5,
    "currentStudents" INTEGER NOT NULL DEFAULT 0,
    "currentTeachers" INTEGER NOT NULL DEFAULT 0,
    "currentStorage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "monthlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 50,
    "billingStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "nextBillingDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institute_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institute_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "response" JSONB,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "instituteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- CreateIndex
CREATE INDEX "super_admins_email_idx" ON "super_admins"("email");

-- CreateIndex
CREATE INDEX "super_admins_isActive_idx" ON "super_admins"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_refresh_tokens_token_key" ON "super_admin_refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "super_admin_refresh_tokens_superAdminId_idx" ON "super_admin_refresh_tokens"("superAdminId");

-- CreateIndex
CREATE INDEX "super_admin_refresh_tokens_expiresAt_idx" ON "super_admin_refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "institutes_code_key" ON "institutes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "institutes_slug_key" ON "institutes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "institutes_subdomain_key" ON "institutes"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "institutes_customDomain_key" ON "institutes"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "institutes_databaseName_key" ON "institutes"("databaseName");

-- CreateIndex
CREATE UNIQUE INDEX "institutes_adminId_key" ON "institutes"("adminId");

-- CreateIndex
CREATE INDEX "institutes_status_idx" ON "institutes"("status");

-- CreateIndex
CREATE INDEX "institutes_slug_idx" ON "institutes"("slug");

-- CreateIndex
CREATE INDEX "institutes_subdomain_idx" ON "institutes"("subdomain");

-- CreateIndex
CREATE INDEX "institutes_environment_idx" ON "institutes"("environment");

-- CreateIndex
CREATE UNIQUE INDEX "institute_invitations_token_key" ON "institute_invitations"("token");

-- CreateIndex
CREATE INDEX "institute_invitations_instituteId_idx" ON "institute_invitations"("instituteId");

-- CreateIndex
CREATE INDEX "institute_invitations_token_idx" ON "institute_invitations"("token");

-- CreateIndex
CREATE INDEX "webhook_logs_instituteId_idx" ON "webhook_logs"("instituteId");

-- CreateIndex
CREATE INDEX "webhook_logs_event_idx" ON "webhook_logs"("event");

-- CreateIndex
CREATE INDEX "webhook_logs_status_idx" ON "webhook_logs"("status");

-- AddForeignKey
ALTER TABLE "super_admin_refresh_tokens" ADD CONSTRAINT "super_admin_refresh_tokens_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "super_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institute_invitations" ADD CONSTRAINT "institute_invitations_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

