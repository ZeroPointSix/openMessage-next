FROM node:24.8.0-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/user-web/package.json apps/user-web/package.json
RUN pnpm install --frozen-lockfile --filter @openmessage/user-web...
COPY apps/user-web apps/user-web
RUN pnpm --filter @openmessage/user-web build

FROM node:24.8.0-alpine
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/user-web/package.json apps/user-web/package.json
COPY --from=build /app/apps/user-web/dist apps/user-web/dist
COPY --from=build /app/apps/user-web/src apps/user-web/src
COPY --from=build /app/apps/user-web/node_modules apps/user-web/node_modules
EXPOSE 4173
CMD ["node", "apps/user-web/src/server/index.ts"]
