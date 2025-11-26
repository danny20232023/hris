# ============================
# Stage 1 — Build
# ============================
FROM node:20-bullseye AS builder

WORKDIR /app

# 🔥 REQUIRED FIXES
ENV ROLLUP_DISABLE_NATIVE=1
ENV npm_config_optional=false

# Copy package files
COPY package*.json ./

# ❗ IMPORTANT: Remove lockfile to avoid Rollup native binary install
RUN rm -f package-lock.json

# Install deps cleanly
RUN npm install --legacy-peer-deps

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
