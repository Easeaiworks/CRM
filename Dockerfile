FROM node:20-alpine

WORKDIR /app

# Copy all package files first for caching
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install backend dependencies
RUN cd backend && npm ci --only=production

# Install frontend dependencies
RUN cd frontend && npm ci

# Copy all source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Build frontend
RUN cd frontend && npx vite build

# Create data directory for SQLite
RUN mkdir -p backend/data

# Expose port
EXPOSE 3001

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Start server (auto-seeds on first run)
CMD ["node", "backend/server.js"]
