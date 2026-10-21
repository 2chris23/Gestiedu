SET lock_timeout = '10s';

-- LA DESCARGA EN CUBOS (18-oct-2026). Regla: «lo único que puede frenar a una
-- persona es su teléfono o su internet, nunca el sistema». Al entrar no se
-- arma nada: el índice de cada persona y sus cubos ya están armados (de noche,
-- al crear la cuenta y al cambiar algo). Ver services/cubos-de-precarga.service.ts.

-- Un cubo: un trozo de la descarga, ya comprimido. Compartido («liceo:ROL»,
-- «seccion:ROL:<id>») o de una persona («persona:<id>:<n>»).
CREATE TABLE IF NOT EXISTS "cubos_de_precarga" (
    "clave" TEXT NOT NULL,
    "lecturas" TEXT[] NOT NULL DEFAULT '{}',
    -- La huella de sus lecturas (ordenadas): si cambian, se rehace.
    "firma" TEXT NOT NULL DEFAULT '',
    -- Los ids que nombran sus lecturas y si alguna no nombra ninguno: con eso
    -- se sabe, por cada cambio, si este cubo quedó viejo.
    "ids" TEXT[] NOT NULL DEFAULT '{}',
    "sinIds" BOOLEAN NOT NULL DEFAULT false,
    "dueno" TEXT,
    "armadoComo" TEXT,
    "contenido" BYTEA,
    "huella" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "marca" BIGINT NOT NULL DEFAULT 0,
    "sucio" BOOLEAN NOT NULL DEFAULT true,
    "prioridad" INTEGER NOT NULL DEFAULT 0,
    "armadoEn" TIMESTAMPTZ(6),
    CONSTRAINT "cubos_de_precarga_pkey" PRIMARY KEY ("clave")
);
CREATE INDEX IF NOT EXISTS "cubos_de_precarga_sucio_idx" ON "cubos_de_precarga"("prioridad" DESC) WHERE "sucio";
CREATE INDEX IF NOT EXISTS "cubos_de_precarga_ids_idx" ON "cubos_de_precarga" USING GIN ("ids");
CREATE INDEX IF NOT EXISTS "cubos_de_precarga_dueno_idx" ON "cubos_de_precarga"("dueno");

-- El índice de cada persona: qué cubos son suyos y qué páginas guardar.
CREATE TABLE IF NOT EXISTS "indices_de_precarga" (
    "usuarioId" TEXT NOT NULL,
    "claves" TEXT[] NOT NULL DEFAULT '{}',
    "paginas" TEXT[] NOT NULL DEFAULT '{}',
    "version" TEXT NOT NULL DEFAULT '',
    "huellaDeLaPersona" TEXT NOT NULL DEFAULT '',
    "dia" TEXT NOT NULL DEFAULT '',
    "pendiente" BOOLEAN NOT NULL DEFAULT true,
    "prioridad" INTEGER NOT NULL DEFAULT 0,
    "pedidoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "armadoEn" TIMESTAMPTZ(6),
    CONSTRAINT "indices_de_precarga_pkey" PRIMARY KEY ("usuarioId")
);
CREATE INDEX IF NOT EXISTS "indices_de_precarga_pendiente_idx" ON "indices_de_precarga"("prioridad" DESC, "pedidoEn") WHERE "pendiente";

-- Hasta qué cambio se miró para ensuciar cubos (una fila).
CREATE TABLE IF NOT EXISTS "cursor_de_los_cubos" (
    "id" TEXT NOT NULL DEFAULT 'liceo',
    "hasta" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "cursor_de_los_cubos_pkey" PRIMARY KEY ("id")
);
