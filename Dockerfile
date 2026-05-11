FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY server.js .
RUN mkdir -p sessions

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
