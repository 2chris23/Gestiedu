-- Reemplazo de una clase suspendida por otra materia de la misma sección.
-- CreateTable
CREATE TABLE "class_replacements" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "suspendedSubjectId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "class_replacements_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "class_replacements_teacherId_date_idx" ON "class_replacements"("teacherId", "date");
-- CreateIndex
CREATE INDEX "class_replacements_classroomId_date_idx" ON "class_replacements"("classroomId", "date");
-- CreateIndex
CREATE UNIQUE INDEX "class_replacements_classroomId_date_startTime_key" ON "class_replacements"("classroomId", "date", "startTime");
-- AddForeignKey
ALTER TABLE "class_replacements" ADD CONSTRAINT "class_replacements_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "class_replacements" ADD CONSTRAINT "class_replacements_suspendedSubjectId_fkey" FOREIGN KEY ("suspendedSubjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "class_replacements" ADD CONSTRAINT "class_replacements_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "class_replacements" ADD CONSTRAINT "class_replacements_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
