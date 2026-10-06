FROM oven/bun:1.3.6
WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY server.ts ./
COPY public ./public
ENV NODE_ENV=production
CMD ["bun","run","server.ts"]
