FROM node:20-bullseye AS builder

WORKDIR /app

ENV ROLLUP_DISABLE_NATIVE=1

# Copy package files
COPY package*.json ./

# Remove both lockfile AND node_modules to force clean install
RUN rm -rf package-lock.json node_modules

# Install WITH optional dependencies (required for esbuild and rollup binaries)
RUN npm install

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