FROM node:20-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @daftar/api build

ENV NODE_ENV=production

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["pnpm", "start"]
