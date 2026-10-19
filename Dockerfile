FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

WORKDIR /app

COPY --chown=node:node package.json server.js store.js ./
COPY --chown=node:node public ./public

RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

CMD ["node", "server.js"]
