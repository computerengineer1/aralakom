# ---- Build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY server server
COPY web web
COPY tsconfig*.json ./
RUN npm run build -w server && npm run build -w web \
  && npm prune --omit=dev

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Server: compiled code + fonts (used for PDF generation)
COPY --from=build /repo/server/dist ./server/dist
COPY --from=build /repo/server/package.json ./server/package.json
COPY --from=build /repo/server/assets ./server/assets
# Web build served by the server
COPY --from=build /repo/web/dist ./web/dist
# Production dependencies only
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
# Private file storage (mount a volume here in production)
RUN mkdir -p /app/data/uploads /app/data/outbox && chmod 750 /app/data
EXPOSE 8080
USER node
WORKDIR /app/server
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
