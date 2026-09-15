-- DropForeignKey
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_instituteId_fkey";

-- DropForeignKey
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_studentId_fkey";

-- DropForeignKey
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_classroomId_fkey";

-- DropIndex
DROP INDEX "users_classroomId_idx";

-- DropIndex
DROP INDEX "users_classroomId_role_idx";

-- AlterTable
ALTER TABLE "academic_records" ADD COLUMN     "assignedClassroomId" TEXT,
ADD COLUMN     "finalResult" TEXT,
ADD COLUMN     "pendingSubjects" JSONB,
ADD COLUMN     "subjectGrades" JSONB;

-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "involvedStudentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "observationsTitle" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspendedReason" TEXT,
ALTER COLUMN "date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "evaluation_plan_rows" ADD COLUMN     "extraData" TEXT;

-- AlterTable
ALTER TABLE "institutes" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "ministryText" SET DEFAULT 'República Bolivariana de Venezuela
Ministerio del Poder Popular para la Educación';

-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "classSessionId" TEXT,
ADD COLUMN     "classroomId" TEXT,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "subjectId" TEXT,
ALTER COLUMN "type" SET DEFAULT 'OBSERVACION';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "classroomId",
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- DropTable
DROP TABLE "enrollments";

-- CreateTable
CREATE TABLE "class_activities" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TAREA',
    "target" TEXT NOT NULL DEFAULT 'NEXT',
    "tag" TEXT,
    "dueDate" TIMESTAMP(3),
    "maxScore" DOUBLE PRECISION DEFAULT 20,
    "scores" JSONB,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "carriedOver" BOOLEAN NOT NULL DEFAULT false,
    "classroomId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "planRowId" TEXT,
    "classSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_activities_classroomId_subjectId_idx" ON "class_activities"("classroomId", "subjectId");

-- CreateIndex
CREATE INDEX "class_activities_classSessionId_idx" ON "class_activities"("classSessionId");

-- CreateIndex
CREATE INDEX "class_activities_classroomId_subjectId_target_idx" ON "class_activities"("classroomId", "subjectId", "target");

-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_classroomId_subjectId_date_key" ON "class_sessions"("classroomId", "subjectId", "date");

-- CreateIndex
CREATE INDEX "observations_classroomId_idx" ON "observations"("classroomId");

-- CreateIndex
CREATE INDEX "observations_subjectId_idx" ON "observations"("subjectId");

-- CreateIndex
CREATE INDEX "observations_classSessionId_idx" ON "observations"("classSessionId");

-- CreateIndex
CREATE INDEX "observations_groupId_idx" ON "observations"("groupId");

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_planRowId_fkey" FOREIGN KEY ("planRowId") REFERENCES "evaluation_plan_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

