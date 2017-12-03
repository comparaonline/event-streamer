FROM mhart/alpine-node:8
LABEL Name="ComparaOnline fw-router" Version="1.0"

ARG ENVIRONMENT="production"
ENV NODE_ENV=${ENVIRONMENT}
EXPOSE 4000
WORKDIR /code

COPY package.json yarn.lock ./
RUN yarn install
COPY build config ./code/


CMD ["yarn", "start"]
