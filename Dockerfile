FROM oven/bun:1.3.6
WORKDIR /app

COPY railway/package.json railway/bun.lock ./
RUN bun install --production --frozen-lockfile

COPY railway/*.ts railway/*.sql ./
COPY railway/data ./data
COPY railway/public ./public

ENV NODE_ENV=production
ENV DATA_MODE=PRODUCTION
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "const r=await fetch('http://127.0.0.1:'+process.env.PORT+'/health'); if(!r.ok) process.exit(1)" || exit 1

CMD ["bun","run","server.ts"]
