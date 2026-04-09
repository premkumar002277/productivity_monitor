FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
RUN npm install

COPY apps/server apps/server
WORKDIR /app/apps/server
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./package.json
COPY --from=builder /app/apps/server/prisma ./prisma

EXPOSE 4000
CMD ["node", "dist/index.js"]
