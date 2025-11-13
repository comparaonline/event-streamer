FROM node:18.18.0-alpine as build
WORKDIR /code
RUN apk --no-cache add ca-certificates \
  lz4-dev \
  musl-dev \
  cyrus-sasl-dev \
  openssl-dev \
  bash \
  make \
  g++ \
  python3
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate && pnpm install --frozen-lockfile
COPY tsconfig.json  ./

COPY src/ ./src
RUN pnpm build
