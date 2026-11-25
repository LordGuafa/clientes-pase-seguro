# ---------- Etapa 1: compilar TypeScript ----------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

# Primero solo los manifiestos: si no cambian, Docker reutiliza la capa de dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ---------- Etapa 2: imagen final, solo lo necesario para ejecutar ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

COPY --from=build /app/dist ./dist
COPY openapi ./openapi

# No correr como root dentro del contenedor
USER node
EXPOSE 3000

# La plataforma y docker compose usan esto para saber si el servicio está vivo
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" || exit 1

CMD ["node", "dist/main.js"]