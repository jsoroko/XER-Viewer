# syntax=docker/dockerfile:1

# ---- Build: compile the React + Tailwind app into static files ---------------
# Debian-based Bun image (glibc): Tailwind's native binaries install cleanly there.
FROM docker.io/oven/bun:1.3 AS build
WORKDIR /app

# Dependencies first so this layer is cached until package.json / bun.lock change.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json bunfig.toml bun-env.d.ts build.ts ./
COPY src ./src
RUN bun run build

# ---- Serve: static files behind an unprivileged nginx ------------------------
# Runs as a non-root user and listens on 8080, so it needs no special privileges.
FROM docker.io/nginxinc/nginx-unprivileged:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
