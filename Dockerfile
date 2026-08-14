# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

# Generate Prisma client, then compile
RUN npx prisma generate
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

# Install production deps only, then copy build output
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

RUN addgroup -S foodiebus && adduser -S foodiebus -G foodiebus
USER foodiebus

EXPOSE 8080

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
