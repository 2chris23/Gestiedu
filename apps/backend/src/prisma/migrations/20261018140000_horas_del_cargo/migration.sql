SET lock_timeout = '10s';

-- Las horas del cargo de cada profesor (36, 24, 12…). Vacío = el máximo del
-- liceo (`academicConfig.cargaHoraria`). `services/personal.service.ts`.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "horasDelCargo" INTEGER;
