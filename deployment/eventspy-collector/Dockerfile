ARG BROWSER_BASE_IMAGE
# Must be mcr.microsoft.com/playwright:v1.62.0-noble@sha256:<64 lowercase hex>.
FROM ${BROWSER_BASE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production HOME=/tmp/eventspy-home
COPY --chown=1000:1000 package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=1000:1000 scripts/tickets ./scripts/tickets
COPY --chown=1000:1000 src/lib/tickets ./src/lib/tickets
USER 1000:1000
ENTRYPOINT ["node", "scripts/tickets/eventspy-collector.mjs"]
