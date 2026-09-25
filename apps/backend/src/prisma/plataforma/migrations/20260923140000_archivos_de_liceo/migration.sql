-- CreateTable
CREATE TABLE "archivos_de_liceo" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "datos" BYTEA NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_de_liceo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "archivos_de_liceo_instituteId_nombre_key" ON "archivos_de_liceo"("instituteId", "nombre");

-- AddForeignKey
ALTER TABLE "archivos_de_liceo" ADD CONSTRAINT "archivos_de_liceo_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

