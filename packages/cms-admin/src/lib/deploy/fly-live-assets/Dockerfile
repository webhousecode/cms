FROM oven/bun:1.1-alpine

WORKDIR /app

COPY server.ts ./

RUN mkdir -p /srv/deploys

ENV PORT=8080
ENV SITE_DATA_ROOT=/srv

EXPOSE 8080

CMD ["bun", "run", "server.ts"]
