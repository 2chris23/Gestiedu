# Dockerfile para backend
FROM node:20-alpine
WORKDIR /app
COPY apps/backend/package*.json ./
RUN npm install --legacy-peer-deps
COPY apps/backend/ .
RUN npx prisma generate || true
CMD ["npm", "run", "dev"]
