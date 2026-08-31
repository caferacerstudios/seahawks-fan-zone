ARG EVENTSPY_BROWSER_IMAGE
FROM ${EVENTSPY_BROWSER_IMAGE}
WORKDIR /app
ENV NODE_ENV=production HOME=/tmp/eventspy-home
COPY --chown=1000:1000 scripts/tickets ./scripts/tickets
COPY --chown=1000:1000 src/lib/tickets ./src/lib/tickets
USER 1000:1000
ENTRYPOINT ["node", "scripts/tickets/eventspy-collector.mjs"]
