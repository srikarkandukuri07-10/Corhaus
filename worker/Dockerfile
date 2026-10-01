# Corhaus WhatsApp Worker
#
# Single artefact deploys to Railway, Fly.io, Render, or any Docker host.
# The critical part is the /data volume: it holds the Baileys pairing
# credentials, and without it every restart requires a new QR scan.
#
# Build (from the worker/ directory):   docker build -t corhaus-worker .
# Run:   docker run -d --name corhaus-worker \
#          -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... \
#          -v corhaus-wa:/data corhaus-worker

FROM node:20-slim AS build
WORKDIR /app

# Install with the lockfile first so dependency layers cache across code edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Runtime deps only — no TypeScript, no dev packages in the shipped image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Baileys credentials. MUST be a mounted volume in production, not container
# layer storage, or the pairing is lost on every deploy.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]
ENV WA_SESSION_DIR=/data

USER node
CMD ["node", "dist/index.js"]