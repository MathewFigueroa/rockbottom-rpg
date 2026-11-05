FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rockbottom/mcp build
RUN pnpm --filter @rockbottom/mcp deploy --legacy --prod /runtime/mcp

FROM node:22-alpine
RUN addgroup -S rockbottom && adduser -S rockbottom -G rockbottom
WORKDIR /app
COPY --from=build /runtime/mcp ./mcp
USER rockbottom
ENV NODE_ENV=production MCP_TRANSPORT=sse MCP_PORT=3001 MCP_HOST=0.0.0.0 GAME_SERVER_URL=http://server:3000
EXPOSE 3001
CMD ["node", "mcp/dist/src/index.js"]
