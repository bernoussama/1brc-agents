# Tiny pinned proxy image (same base family as the sandbox image).
FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03
COPY allowlist-proxy.js /opt/proxy/allowlist-proxy.js
COPY host-local-forward.js /opt/proxy/host-local-forward.js
ENV PROXY_PORT=3128
EXPOSE 3128
CMD ["node", "/opt/proxy/allowlist-proxy.js"]
