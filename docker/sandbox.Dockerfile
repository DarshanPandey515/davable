
FROM node:20-bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        python3 \
        python3-pip \
        ca-certificates \
        procps \
    && rm -rf /var/lib/apt/lists/*

ENV HOME=/root
WORKDIR /app

CMD ["tail", "-f", "/dev/null"]
