FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install backend dependencies
RUN cd backend && npm ci --only=production

# Install frontend dependencies and build
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npx vite build

# Copy backend source
COPY backend/ ./backend/

# Create data directory for SQLite
RUN mkdir -p backend/data

# Expose port
EXPOSE 3001

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Start server
CMD ["node", "backend/server.js"]
