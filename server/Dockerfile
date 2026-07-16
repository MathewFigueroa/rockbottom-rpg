FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rockbottom/shared build && pnpm --filter @rockbottom/server build

FROM node:22-alpine
RUN addgroup -S rockbottom && adduser -S rockbottom -G rockbottom
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/packs ./packs
COPY package.json ./package.json
USER rockbottom
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
