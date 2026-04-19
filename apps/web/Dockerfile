FROM node:20-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @daftar/web build

ENV NODE_ENV=production

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "start"]
