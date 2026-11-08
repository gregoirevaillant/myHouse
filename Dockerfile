FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-slim AS backend
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl sqlite3 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=1000 DATA_DIR=/data DATABASE_URL=file:/data/app.db PUBLIC_DIR=/app/public
WORKDIR /app
COPY --from=backend /app/backend/node_modules ./node_modules
COPY --from=backend /app/backend/dist ./dist
COPY --from=backend /app/backend/prisma ./prisma
COPY --from=backend /app/backend/package.json ./
COPY --from=frontend /app/frontend/dist ./public
VOLUME /data
EXPOSE 1000
# Démarre en root uniquement pour donner le volume (créé par root avant) à l'utilisateur node, puis l'app tourne sans droits
CMD ["sh", "-c", "chown -R node:node /data && exec setpriv --reuid=node --regid=node --init-groups sh -c 'npx prisma migrate deploy && node dist/seed.js && node dist/server.js'"]
