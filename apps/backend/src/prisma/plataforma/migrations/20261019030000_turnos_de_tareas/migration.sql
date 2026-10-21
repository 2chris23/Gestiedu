SET lock_timeout = '10s';

-- Cada tarea programada, una sola dueña entre todos los procesos
-- (utils/turno-de-la-tarea.ts).
CREATE TABLE IF NOT EXISTS "turnos_de_tareas" (
    "nombre" TEXT NOT NULL,
    "quien" TEXT NOT NULL,
    "hasta" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "turnos_de_tareas_pkey" PRIMARY KEY ("nombre")
);
