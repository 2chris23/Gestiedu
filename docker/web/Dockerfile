# Imagen de producción del frontend (Next.js).
# Antes esta imagen ejecutaba `npm run dev`: el servidor de desarrollo, lento y
# sin optimizar. Ahora compila y arranca el servidor de producción.

FROM node:20-alpine AS builder
WORKDIR /app

COPY apps/web/package*.json ./
RUN npm ci --legacy-peer-deps

COPY apps/web/ .
# copy-shared.js busca shared/ en ../../shared respecto de apps/web
COPY shared/ /shared/
# La URL de la API se incrusta en el bundle en tiempo de compilación
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY apps/web/package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js

USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
