FROM node:16.13.2-slim

WORKDIR /app

ENV NODE_OPTIONS="--max-old-space-size=1024"

# install dependencies, use local cache
COPY package.json yarn.lock .yarnrc.yml /app/
COPY .yarn /app/.yarn
RUN yarn install --immutable

ARG RELEASE=unknown
ENV RELEASE=$RELEASE

# copy sources
COPY . /app

# build the application
RUN yarn build

EXPOSE 80

# run the application
CMD ["node", "-r", "tsconfig-paths/register", "dist/main.js"]
