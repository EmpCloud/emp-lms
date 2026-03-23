# .dockerignore contents (create as packages/server/.dockerignore):
# node_modules
# dist
# .env
# *.log
# .git
# coverage
# __tests__

# ---- Stage 1: Build ----
FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy shared and server package manifests
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

# Build shared first, then server
RUN pnpm --filter shared build && pnpm --filter server build

# ---- Stage 2: Runtime ----
FROM node:20-alpine

# Install Chromium for Puppeteer (PDF certificate generation)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

WORKDIR /app

# Copy built output and dependencies
COPY --from=build /app/packages/server/dist ./dist/server
COPY --from=build /app/packages/shared/dist ./dist/shared
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build /app/packages/server/package.json ./packages/server/

# Copy email/PDF templates if they exist
COPY --from=build /app/packages/server/templates ./templates

EXPOSE 4700

CMD ["node", "dist/server/src/index.js"]
