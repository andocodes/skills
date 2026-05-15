FROM debian:bookworm-slim

ARG SWARM_AGENT_HARNESS=codex
ARG SWARM_AGENT_TOOLCHAIN=core

ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-lc"]

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  ca-certificates \
  curl \
  git \
  jq \
  openssh-client \
  pkg-config \
  python3 \
  ripgrep \
  xz-utils \
  build-essential \
  && rm -rf /var/lib/apt/lists/*

RUN if [[ "$SWARM_AGENT_TOOLCHAIN" == "rust" ]]; then \
    curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal; \
  fi

RUN if [[ "$SWARM_AGENT_TOOLCHAIN" == "go" ]]; then \
    apt-get update && apt-get install -y --no-install-recommends golang-go && rm -rf /var/lib/apt/lists/*; \
  fi

RUN if [[ "$SWARM_AGENT_HARNESS" == "codex" || "$SWARM_AGENT_HARNESS" == "claude" ]]; then \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install -g npm@latest; \
  fi

COPY container/fake-agent.sh /usr/local/share/swarm/fake-agent.sh

RUN if [[ "$SWARM_AGENT_HARNESS" == "codex" ]]; then \
    npm install -g @openai/codex; \
  elif [[ "$SWARM_AGENT_HARNESS" == "claude" ]]; then \
    npm install -g @anthropic-ai/claude-code; \
  elif [[ "$SWARM_AGENT_HARNESS" == "fake" ]]; then \
    cp /usr/local/share/swarm/fake-agent.sh /usr/local/bin/codex && \
    chmod +x /usr/local/bin/codex && \
    cp /usr/local/bin/codex /usr/local/bin/claude; \
  fi

RUN useradd -m -u 1000 swarm
USER swarm
WORKDIR /workspace
ENV PATH="/home/swarm/.cargo/bin:${PATH}"
