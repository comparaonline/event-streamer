FROM node:18-alpine as build
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
RUN npm install -g pnpm
RUN pnpm install
COPY tsconfig.json  ./

COPY src/ ./src
RUN pnpm build
