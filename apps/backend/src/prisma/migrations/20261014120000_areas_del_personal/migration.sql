SET lock_timeout = '10s';

-- LAS ÁREAS DEL PERSONAL (octubre 2026)
--
-- Cristian: «en el panel de personal, crea un área como cocina, y añadir
-- personal se le coloca un nombre y listo». La lista vive con las categorías
-- de gasto, en la fila única de los ajustes de pagos. El área de cada persona
-- es su `cargo`; «Profesor» va siempre y no se guarda aquí.
ALTER TABLE "payment_settings" ADD COLUMN "areasDelPersonal" JSONB NOT NULL DEFAULT '[]';
