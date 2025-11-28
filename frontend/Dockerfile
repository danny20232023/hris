# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN rm -f package-lock.json
RUN npm install

COPY . .

ARG VITE_API_URL
ARG VITE_UPLOADS_URL

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_UPLOADS_URL=${VITE_UPLOADS_URL}

RUN npm run build

# Stage 2: Production
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config template
COPY frontend/nginx.conf.template /etc/nginx/conf.d/default.conf.template

# Copy entrypoint script
COPY frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]