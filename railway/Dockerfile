FROM oven/bun:1.3.6
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY *.ts *.sql ./
COPY data ./data
COPY public ./public
ENV NODE_ENV=production
ENV DATA_MODE=SIMULATED
CMD ["bun","run","server.ts"]
