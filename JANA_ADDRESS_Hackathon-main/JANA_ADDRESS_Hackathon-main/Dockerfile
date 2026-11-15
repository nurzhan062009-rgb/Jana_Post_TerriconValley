FROM node:22-alpine

ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data
WORKDIR /app

COPY package.json server.mjs README.md manifest.json sw.js ./
COPY app ./app
COPY web ./web
COPY vendor ./vendor
COPY fonts ./fonts
COPY test ./test

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.mjs"]
