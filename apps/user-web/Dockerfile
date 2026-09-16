FROM node:24.8.0-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/user-web/package.json apps/user-web/package.json
RUN pnpm install --frozen-lockfile --filter @openmessage/user-web...
COPY apps/user-web apps/user-web
RUN pnpm --filter @openmessage/user-web build
RUN pnpm --filter @openmessage/user-web --prod deploy /user-web

FROM node:24.8.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /user-web/package.json ./
COPY --from=build /user-web/node_modules ./node_modules
COPY --from=build /app/apps/user-web/dist ./dist
COPY --from=build /app/apps/user-web/src ./src
EXPOSE 4173
CMD ["node", "src/server/index.ts"]
