# Dockerfile para frontend web
FROM node:20-alpine
WORKDIR /app
COPY apps/web/package*.json ./
RUN npm install --legacy-peer-deps
COPY apps/web/ .
CMD ["npm", "run", "dev"]
