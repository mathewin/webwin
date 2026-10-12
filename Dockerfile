FROM node:22-bookworm-slim

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd backend && npm ci --omit=dev
RUN cd frontend && npm ci

COPY backend ./backend
COPY frontend ./frontend

RUN cd frontend && npm run build

ENV PORT=3001
ENV NODE_ENV=production
ENV FRONTEND_DIST=/app/frontend/dist
EXPOSE 3001

WORKDIR /app/backend
CMD ["node", "--experimental-sqlite", "src/server.js"]
