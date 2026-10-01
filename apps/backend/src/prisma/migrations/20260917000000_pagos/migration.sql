-- Módulo de pagos: configuración, plan por alumno, pagos (anulables) y su reparto en cuotas.
-- CreateTable
CREATE TABLE "payment_settings" (
    "id" TEXT NOT NULL DEFAULT 'liceo',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "dueMode" TEXT NOT NULL DEFAULT 'SAME_DAY',
    "dueDay" INTEGER NOT NULL DEFAULT 5,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "acceptedCurrencies" TEXT NOT NULL DEFAULT 'BOTH',
    "feeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "enrollmentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enrollmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "methods" JSONB NOT NULL DEFAULT '["Efectivo", "Pago Móvil", "Transferencia", "Zelle"]',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_payment_plans" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "dueDay" INTEGER,
    "exempt" BOOLEAN NOT NULL DEFAULT false,
    "exemptReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "receiptNumber" SERIAL NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "paidAt" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "exchangeRate" DECIMAL(14,4),
    "amountBase" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT,
    "annulledAt" TIMESTAMP(3),
    "annulledById" TEXT,
    "annulReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "installmentKey" TEXT NOT NULL,
    "amountBase" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_payment_plans_academicYearId_idx" ON "student_payment_plans"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "student_payment_plans_studentId_academicYearId_key" ON "student_payment_plans"("studentId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptNumber_key" ON "payments"("receiptNumber");

-- CreateIndex
CREATE INDEX "payments_studentId_academicYearId_idx" ON "payments"("studentId", "academicYearId");

-- CreateIndex
CREATE INDEX "payments_academicYearId_annulledAt_idx" ON "payments"("academicYearId", "annulledAt");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_installmentKey_idx" ON "payment_allocations"("installmentKey");

-- AddForeignKey
ALTER TABLE "student_payment_plans" ADD CONSTRAINT "student_payment_plans_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_payment_plans" ADD CONSTRAINT "student_payment_plans_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

