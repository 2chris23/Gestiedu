# Dockerfile para mobile
FROM node:20-alpine
WORKDIR /app
COPY apps/mobile/package*.json ./
RUN npm install --legacy-peer-deps
COPY apps/mobile/ .
CMD ["npm", "run", "start"]
