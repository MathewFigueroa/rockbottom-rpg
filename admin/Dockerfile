FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rockbottom/admin build

FROM nginx:1.27-alpine
COPY deploy/nginx-admin.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/admin/dist /usr/share/nginx/html/admin
EXPOSE 80
