FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
ENV UPLOAD_DIR=/data/uploads

RUN mkdir -p /data/uploads

EXPOSE 8080

# Применяем миграции/seed при старте (безопасно — скрипты idempotent)
CMD ["sh", "-c", "node src/migrate.js && node src/seed.js && node src/index.js"]
