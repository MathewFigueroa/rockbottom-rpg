FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rockbottom/shared build && pnpm --filter @rockbottom/client build

FROM nginx:1.27-alpine
COPY deploy/nginx-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
