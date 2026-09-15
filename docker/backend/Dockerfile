# Imagen de producción del backend.
#
# Se compila a JavaScript y se arranca con node (antes esta imagen ejecutaba
# `npm run dev`, es decir, el servidor de desarrollo). Se mantienen la CLI de
# Prisma, el esquema y las migraciones dentro de la imagen: el alta de un liceo
# y el reintento de migraciones desde el panel ejecutan `prisma migrate deploy`.

# ---------- 1. Dependencias y compilación ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY apps/backend/package*.json ./
RUN npm ci --legacy-peer-deps

COPY apps/backend/ .

# Los dos clientes de Prisma: el de los liceos y el de la plataforma.
# Sin `|| true`: si la generación falla, la imagen no se construye.
RUN npx prisma generate --schema=src/prisma/schema.prisma \
    && npx prisma generate --schema=src/prisma/platform-schema.prisma \
    && npm run build \
    # tsc no copia lo que no es TypeScript, y el código compilado los busca
    # junto a él: el esquema y las migraciones para `migrate deploy`, y el
    # cliente de la plataforma que se genera en src/generated.
    && mkdir -p dist/prisma \
    && cp -r src/prisma/schema.prisma src/prisma/migrations dist/prisma/ \
    && cp -r src/generated dist/generated

# ---------- 2. Imagen final ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# psql/pg_dump para los respaldos y para esperar a PostgreSQL al arrancar
RUN apk add --no-cache postgresql-client

COPY apps/backend/package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# La CLI de Prisma se invoca con --schema=src/prisma/... (alta de liceos y migrator)
COPY --from=builder /app/src/prisma ./src/prisma
COPY --from=builder /app/src/generated ./src/generated

# No ejecutar como root
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
