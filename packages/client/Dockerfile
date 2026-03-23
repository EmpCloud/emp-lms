# ---- Stage 1: Build ----
FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy shared and client package manifests
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared/ packages/shared/
COPY packages/client/ packages/client/

# Build shared first, then client
RUN pnpm --filter shared build && pnpm --filter client build

# ---- Stage 2: Serve with Nginx ----
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from build stage
COPY --from=build /app/packages/client/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
