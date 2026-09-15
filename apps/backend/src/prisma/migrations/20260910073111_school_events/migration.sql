-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "suspendedByEventId" TEXT;

-- CreateTable
CREATE TABLE "school_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'INSTITUTE',
    "grades" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "classroomIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "academicYearId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_events_academicYearId_date_idx" ON "school_events"("academicYearId", "date");

-- CreateIndex
CREATE INDEX "school_events_date_idx" ON "school_events"("date");

-- CreateIndex
CREATE INDEX "class_sessions_suspendedByEventId_idx" ON "class_sessions"("suspendedByEventId");

-- AddForeignKey
ALTER TABLE "school_events" ADD CONSTRAINT "school_events_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_events" ADD CONSTRAINT "school_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_suspendedByEventId_fkey" FOREIGN KEY ("suspendedByEventId") REFERENCES "school_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

