# The pinned "identical machine" — same compilers, same glibc for every
# contestant. Build once, tag, record digest in every run manifest.
# Node base because pi (harness) needs modern node + npm.
FROM node:24-bookworm-slim

ARG PI_VERSION=latest
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        bash ca-certificates procps time \
        build-essential \
        clang \
        golang-go \
        zig \
        python3 python3-pip \
        openjdk-17-jdk-headless \
        rustc cargo \
        linux-perf || apt-get install -y --no-install-recommends \
        build-essential clang golang-go zig python3 rustc cargo \
    && rm -rf /var/lib/apt/lists/*

# pi coding agent (the harness agents run under), pinned
RUN npm install -g --ignore-scripts "(@earendil-works/pi-coding-agent@${PI_VERSION})" || \
    npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# Rulebook + judge-provided dev tools live OUTSIDE /work (which gets
# bind-mounted over) — the runner copies them into the session workdir.
COPY program.md /opt/bench/program.md
COPY tools/ /opt/bench/tools/
RUN chmod +x /opt/bench/tools/*.py

# Non-root user
RUN useradd -m -u 1000 agent
ENV HOME=/home/agent
USER agent
WORKDIR /work

ENTRYPOINT ["pi"]
