FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY apps/server apps/server
RUN npm run build --workspace @shodka/server

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install --omit=dev --workspace @shodka/server
COPY --from=build /app/apps/server/dist apps/server/dist
COPY data/seed.json data/seed.json
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
