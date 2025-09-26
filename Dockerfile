FROM node:16-alpine as build
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
COPY package.json yarn.lock ./
RUN yarn install
COPY tsconfig.json  ./

COPY src/ ./src
RUN yarn build
