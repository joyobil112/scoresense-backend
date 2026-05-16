# ScoreSense OMR Backend
# Bundles Java 17 + Audiveris + Node 20 in one container
#
# Build:  docker build -t scoresense-omr .
# Run:    docker run -p 3001:3001 -e ALLOWED_ORIGIN=https://yoursite.netlify.app scoresense-omr
#
# Deploy to Railway:
#   Push this backend/ folder to a GitHub repo, then connect it in Railway.
#   Railway will auto-detect the Dockerfile and build it.

FROM eclipse-temurin:17-jdk-jammy

# Node.js 20
RUN apt-get update && \
    apt-get install -y curl wget unzip && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Audiveris
# Download the latest release jar from GitHub
ENV AUDIVERIS_VERSION=5.3.1
RUN mkdir -p /opt/audiveris && \
    wget -q "https://github.com/Audiveris/audiveris/releases/download/${AUDIVERIS_VERSION}/Audiveris_${AUDIVERIS_VERSION}.jar" \
    -O /opt/audiveris/audiveris.jar

# Wrapper so 'audiveris' works on PATH
RUN printf '#!/bin/sh\nexec java -jar /opt/audiveris/audiveris.jar "$@"\n' \
    > /usr/local/bin/audiveris && chmod +x /usr/local/bin/audiveris

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY omr-server.js ./

ENV PORT=3001
ENV AUDIVERIS_PATH=audiveris

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "omr-server.js"]
