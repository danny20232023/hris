# ============================
# Stage 1 — Build
# ============================
FROM node:20-bullseye AS builder

WORKDIR /app

ENV ROLLUP_DISABLE_NATIVE=1
ENV npm_config_build_from_source=true

# Copy package files
COPY package*.json ./

# Remove both lockfile AND node_modules to force clean install
RUN rm -rf package-lock.json node_modules

# Install with explicit Rollup pre-built binary for Linux
RUN npm install --save-optional=false --no-save @rollup/rollup-linux-x64-gnu@latest

# Now do regular install
RUN npm install --omit=optional

# Copy source code
COPY . .

# Build environment variables
ARG VITE_API_URL
ARG VITE_UPLOADS_URL

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_UPLOADS_URL=$VITE_UPLOADS_URL

# Build the Vite app
RUN npm run build

# ============================
# Stage 2 — Nginx Serve
# ============================
FROM nginx:1.25-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
