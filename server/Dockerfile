FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rockbottom/shared build && pnpm --filter @rockbottom/server build
RUN pnpm --filter @rockbottom/server deploy --legacy --prod /runtime/server

FROM node:22-alpine
RUN addgroup -S rockbottom && adduser -S rockbottom -G rockbottom
WORKDIR /app
COPY --from=build /runtime/server ./server
COPY --from=build /app/server/migrations ./server/migrations
COPY --from=build /app/packs ./packs
COPY package.json ./package.json
RUN mkdir -p /app/data && chown rockbottom:rockbottom /app/data
USER rockbottom
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
