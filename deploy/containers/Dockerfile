FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
ARG VITE_API_BASE=/api/v1
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build && npx tsc --outDir dist-tools --incremental false

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-tools ./dist-tools
USER node
CMD ["node","dist/apps/api/src/main.js"]

FROM nginx:stable-bookworm AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
