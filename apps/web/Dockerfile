FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/web/package.json ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Cache-bust so command-center UI edits are always rebuilt into the image.
ARG CACHEBUST=1
RUN echo "cachebust=$CACHEBUST"
COPY apps/web ./
ARG NEXT_PUBLIC_PRODUCT_NAME=FactoryOps
ARG NEXT_PUBLIC_PRODUCT_ACCENT=#0B6E4F
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_PRODUCT_NAME=$NEXT_PUBLIC_PRODUCT_NAME
ENV NEXT_PUBLIC_PRODUCT_ACCENT=$NEXT_PUBLIC_PRODUCT_ACCENT
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
