# The pinned "identical machine" — same compilers, same glibc for every
# contestant. Build once, tag, record digest in every run manifest.
# Node base because pi (harness) needs modern node + npm.
FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

ARG PI_VERSION=0.84.2
ARG ZIG_VERSION=0.14.1
ARG GRAALVM_RELEASE=25.2.4
ARG GRAALVM_JDK_VERSION=25.0.4
ARG FLAMEGRAPH_COMMIT=41fee1f99f9276008b7cd112fca19dc3ea84ac32
ARG FLAMEGRAPH_SHA256=b1ba3aaaf296ab72ced4dca84514377a4b2c8122831d743f726c106d3d339c2a
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        bash ca-certificates procps time \
        build-essential \
        clang \
        golang-go \
        curl xz-utils \
        graphviz perl \
        python3 python3-pip \
        openjdk-17-jdk-headless \
        rustc cargo \
        zlib1g-dev \
        linux-perf \
    && case "$(dpkg --print-architecture)" in \
         amd64) \
           ZIG_ARCH=x86_64; \
           ZIG_SHA256=24aeeec8af16c381934a6cd7d95c807a8cb2cf7df9fa40d359aa884195c4716c; \
           GRAALVM_ARCH=x64; \
           GRAALVM_SHA256=7100d99cbfec68b03b669cc60c7e8592bbcda1732e8eaebc460fe0b75849a894 ;; \
         arm64) \
           ZIG_ARCH=aarch64; \
           ZIG_SHA256=f7a654acc967864f7a050ddacfaa778c7504a0eca8d2b678839c21eea47c992b; \
           GRAALVM_ARCH=aarch64; \
           GRAALVM_SHA256=0bc65f9c36ae77bd83aad46a2b4de4b0ec97da1b4ac83fedb59e19f868873dee ;; \
         *) echo "unsupported architecture for pinned Zig binary" >&2; exit 1 ;; \
       esac \
    && curl --fail --location --silent --show-error \
         "https://ziglang.org/download/${ZIG_VERSION}/zig-${ZIG_ARCH}-linux-${ZIG_VERSION}.tar.xz" \
         --output /tmp/zig.tar.xz \
    && echo "${ZIG_SHA256}  /tmp/zig.tar.xz" | sha256sum --check --status \
    && mkdir -p /opt/zig \
    && tar -xJf /tmp/zig.tar.xz --strip-components=1 -C /opt/zig \
    && ln -s /opt/zig/zig /usr/local/bin/zig \
    && rm -f /tmp/zig.tar.xz \
    && curl --fail --location --silent --show-error \
         "https://gds.oracle.com/download/graal/25i2/archive/graalvm-jdk-25i2-${GRAALVM_JDK_VERSION}_linux-${GRAALVM_ARCH}_bin.tar.gz" \
         --output /tmp/graalvm.tar.gz \
    && echo "${GRAALVM_SHA256}  /tmp/graalvm.tar.gz" | sha256sum --check --status \
    && mkdir -p /opt/graalvm \
    && tar -xzf /tmp/graalvm.tar.gz --strip-components=1 -C /opt/graalvm \
    && rm -f /tmp/graalvm.tar.gz \
    && curl --fail --location --silent --show-error \
         "https://github.com/brendangregg/FlameGraph/archive/${FLAMEGRAPH_COMMIT}.tar.gz" \
         --output /tmp/flamegraph.tar.gz \
    && echo "${FLAMEGRAPH_SHA256}  /tmp/flamegraph.tar.gz" | sha256sum --check --status \
    && mkdir -p /opt/flamegraph \
    && tar -xzf /tmp/flamegraph.tar.gz --strip-components=1 -C /opt/flamegraph \
    && chmod +x /opt/flamegraph/*.pl \
    && rm -f /tmp/flamegraph.tar.gz \
    && rm -rf /var/lib/apt/lists/*

# Make profiling scripts and the advertised default Java toolchain visible
# even when an agent shell resets PATH for a login shell.
RUN set -eux; \
    for script in /opt/flamegraph/*.pl; do \
      ln -sf "$script" "/usr/local/bin/$(basename "$script")"; \
    done; \
    for tool in java javac jcmd jfr native-image; do \
      ln -sf "/opt/graalvm/bin/$tool" "/usr/local/bin/$tool"; \
    done

# GraalVM is the default Java toolchain; OpenJDK 17 remains installed for
# compatibility with code that specifically targets that LTS release.
ENV GRAALVM_HOME=/opt/graalvm
ENV GRAALVM_VERSION=${GRAALVM_RELEASE}
ENV JAVA_HOME=/opt/graalvm
ENV FLAMEGRAPH_HOME=/opt/flamegraph
ENV PATH=/opt/flamegraph:/opt/graalvm/bin:$PATH

# pi coding agent (the harness agents run under), pinned
RUN npm install -g --ignore-scripts "@earendil-works/pi-coding-agent@${PI_VERSION}"

# Fail the image build if any advertised language/runtime is missing.
RUN set -eux; \
    for tool in bash gcc g++ clang go rustc cargo zig python3 pip3 node npm java javac native-image perf perl dot pi stackcollapse-perf.pl stackcollapse-go.pl stackcollapse-jstack.pl flamegraph.pl; do \
      command -v "$tool"; \
    done; \
    test "$(zig version)" = "${ZIG_VERSION}"; \
    test "$(pi --version)" = "${PI_VERSION}"; \
    test "$(command -v java)" = /opt/graalvm/bin/java; \
    java --version; \
    native-image --version

# Rulebook + judge-provided dev tools live OUTSIDE /work (which gets
# bind-mounted over) — the runner copies them into the session workdir.
COPY task/program.md /opt/bench/program.md
COPY task/tools/ /opt/bench/tools/
RUN chmod +x /opt/bench/tools/*.py

# Non-root user. The official Node image already uses UID 1000, so retain the
# benchmark's fixed UID while giving that user the stable name and home path.
RUN existing_user="$(getent passwd 1000 | cut -d: -f1)" \
    && if [ -n "$existing_user" ]; then \
         usermod --login agent --home /home/agent --move-home "$existing_user"; \
       else \
         useradd -m -u 1000 agent; \
       fi
ENV HOME=/home/agent
USER agent
WORKDIR /work

ENTRYPOINT ["pi"]
