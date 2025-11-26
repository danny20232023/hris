# Frontend Dockerfile
# Multi-stage build: Node for building, Nginx for serving

# ============================
# STAGE 1: Build (use Debian, not Alpine)
# ============================
FROM node:20-bullseye AS builder

WORKDIR /app

# 🔥 REQUIRED FIX — disable Rollup native binaries
ENV ROLLUP_DISABLE_NATIVE=1
ENV npm_config_optional=false

# Copy package files
COPY package*.json ./

# Install dependencies cleanly
RUN rm -rf node_modules package-lock.json && npm install

# Copy source files
COPY . .

# Build arguments for environment variables
ARG VITE_API_URL
ARG VITE_UPLOADS_URL

# Set environment variables for the build
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_UPLOADS_URL=${VITE_UPLOADS_URL}

# Build the application
RUN npm run build

# ============================
# STAGE 2: Production (use stable Alpine nginx)
# ============================
FROM nginx:1.25-alpine

# Copy built frontend files
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose nginx port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
