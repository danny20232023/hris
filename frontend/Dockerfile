# ============================
# Stage 1 — Build
# ============================
FROM node:20-bullseye AS builder

WORKDIR /app

ENV ROLLUP_DISABLE_NATIVE=1

# Create .npmrc to disable optional dependencies
RUN echo "optional=false" > .npmrc

# Copy package files
COPY package*.json ./

# Remove lockfile
RUN rm -f package-lock.json

# Clean install without optional deps
RUN npm install --omit=optional --no-audit --no-fund

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
