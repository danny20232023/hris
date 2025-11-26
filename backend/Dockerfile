# Backend Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install wget for health checks
RUN apk add --no-cache wget

# Create node user for security (node user already exists in node:18-alpine)
# Ensure we have proper permissions

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source files
COPY --chown=node:node . .

# Create uploads directory with proper permissions
RUN mkdir -p uploads/photo uploads/signature uploads/thumb uploads/education \
    uploads/csc uploads/workcert uploads/certificate uploads/leave && \
    chown -R node:node /app/uploads

# Switch to non-root user for security
USER node

# Expose port (default 5000, can be overridden via environment variable)
EXPOSE 5000

# Set default environment variables (can be overridden via docker-compose)
ENV NODE_ENV=production
ENV PORT=5000

# Start the application
CMD ["node", "server.js"]

