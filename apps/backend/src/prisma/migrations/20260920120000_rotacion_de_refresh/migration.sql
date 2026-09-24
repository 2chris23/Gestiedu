-- El refresh token rota en cada uso. El viejo no se borra de golpe: se marca
-- como reemplazado y vale unos segundos más, porque dos pestañas que renuevan
-- a la vez mandan el MISMO token y una de las dos se quedaría sin sesión.
ALTER TABLE "refresh_tokens" ADD COLUMN "replacedAt" TIMESTAMP(3);
