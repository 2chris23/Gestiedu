SET lock_timeout = '10s';

-- La salud del sistema (18-oct-2026): cada ruta y cada liceo, por ventana de
-- 5 minutos, con su histograma de tiempos (utils/medidor-de-rutas.ts); los
-- errores agrupados por huella (utils/errores-agrupados.ts) y lo que mide el
-- robot que recorre un liceo de muestra. Cada proceso SUMA su parte a la fila
-- de la ventana (INSERT ... ON CONFLICT DO UPDATE).

CREATE TABLE IF NOT EXISTS "metricas_de_rutas" (
    "ventana" TIMESTAMP(3) NOT NULL,
    "ruta" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "e4xx" INTEGER NOT NULL DEFAULT 0,
    "e5xx" INTEGER NOT NULL DEFAULT 0,
    "e429" INTEGER NOT NULL DEFAULT 0,
    "e503" INTEGER NOT NULL DEFAULT 0,
    "sumaMs" BIGINT NOT NULL DEFAULT 0,
    "maxMs" INTEGER NOT NULL DEFAULT 0,
    "cubetas" INTEGER[] NOT NULL,
    "codigos" JSONB NOT NULL DEFAULT '{}',
    "personas" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "metricas_de_rutas_pkey" PRIMARY KEY ("ventana", "ruta", "rol")
);

CREATE TABLE IF NOT EXISTS "metricas_de_liceos" (
    "ventana" TIMESTAMP(3) NOT NULL,
    "instituteId" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "e4xx" INTEGER NOT NULL DEFAULT 0,
    "e5xx" INTEGER NOT NULL DEFAULT 0,
    "e429" INTEGER NOT NULL DEFAULT 0,
    "e503" INTEGER NOT NULL DEFAULT 0,
    "sumaMs" BIGINT NOT NULL DEFAULT 0,
    "maxMs" INTEGER NOT NULL DEFAULT 0,
    "cubetas" INTEGER[] NOT NULL,
    "codigos" JSONB NOT NULL DEFAULT '{}',
    "personas" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "metricas_de_liceos_pkey" PRIMARY KEY ("ventana", "instituteId")
);

CREATE TABLE IF NOT EXISTS "errores_agrupados" (
    "huella" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "donde" TEXT NOT NULL DEFAULT '',
    "ruta" TEXT,
    "version" TEXT,
    "veces" BIGINT NOT NULL DEFAULT 0,
    "liceos" JSONB NOT NULL DEFAULT '{}',
    "primera" TIMESTAMP(3) NOT NULL,
    "ultima" TIMESTAMP(3) NOT NULL,
    "muestra" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT 'abierto',
    "resueltoEn" TIMESTAMP(3),
    CONSTRAINT "errores_agrupados_pkey" PRIMARY KEY ("huella")
);
CREATE INDEX IF NOT EXISTS "errores_agrupados_ultima_idx" ON "errores_agrupados"("ultima");

CREATE TABLE IF NOT EXISTS "pasos_del_robot" (
    "id" TEXT NOT NULL,
    "vuelta" TEXT NOT NULL,
    "en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paso" TEXT NOT NULL,
    "ms" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "estado" INTEGER,
    "detalle" TEXT,
    CONSTRAINT "pasos_del_robot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pasos_del_robot_en_idx" ON "pasos_del_robot"("en");
