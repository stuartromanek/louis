# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run

# ffmpeg from apt; yt-dlp nightly from pip (Debian's package is years behind YouTube).
# YTDLP_CACHE_BUST must change on each deploy/CI build so this layer is not reused from cache.
ARG YTDLP_CACHE_BUST=manual
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    python3 \
    python3-pip \
  && echo "yt-dlp cache bust: ${YTDLP_CACHE_BUST}" \
  && pip3 install --no-cache-dir --break-system-packages --upgrade --pre 'yt-dlp[default]' \
  && yt-dlp --version \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
ENV NUXT_AUDIO_WORK_DIR=/data/audio

COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /data/audio

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
