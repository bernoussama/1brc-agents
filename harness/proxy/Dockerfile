# Tiny pinned proxy image (same base family as the sandbox image)
FROM node:24-bookworm-slim
COPY allowlist-proxy.js /opt/proxy/allowlist-proxy.js
ENV PROXY_PORT=3128
EXPOSE 3128
CMD ["node", "/opt/proxy/allowlist-proxy.js"]
