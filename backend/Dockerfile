FROM node:18-alpine

WORKDIR /app

# Install required build tools for native modules (sharp, etc.)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    wget

# Copy package files
COPY package*.json ./

# Remove package-lock to force clean install
RUN rm -f package-lock.json

# Install dependencies WITH optional deps for sharp
RUN npm install

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

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:5000/health || exit 1

# Start the application
CMD ["node", "server.js"]