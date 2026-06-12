# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code
COPY . .

# Build frontend (Vite) + backend (esbuild)
RUN npm run build

# ─── Stage 2: Production ────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy static data files needed at runtime
COPY src/data ./src/data
COPY server/schema.sql ./server/schema.sql

# Create runtime directories and set ownership before dropping to non-root
RUN mkdir -p /app/data /app/public/generated-audio && \
    chown -R node:node /app/data /app/public/generated-audio

# Run as non-root user
USER node

# Expose the server port
EXPOSE 3000

# Health check — hit the /api/health endpoint every 30s
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Environment defaults (override via docker-compose or -e flags)
ENV NODE_ENV=production \
    PORT=3000 \
    AI_MAX_CONCURRENT=5 \
    AI_MAX_QUEUE=50 \
    AI_TIMEOUT_MS=120000 \
    CACHE_TTL_MS=3600000 \
    CACHE_MAX_ENTRIES=200

CMD ["node", "dist/server.js"]
