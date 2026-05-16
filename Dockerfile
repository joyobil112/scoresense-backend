# ScoreSense OMR Backend
# Fixed: installs Audiveris via apt-get instead of wget (more reliable in Railway/CI)
#
# Build:  docker build -t scoresense-omr .
# Run:    docker run -p 3001:3001 -e ALLOWED_ORIGIN=https://yoursite.netlify.app scoresense-omr

FROM eclipse-temurin:17-jdk-jammy

# Node.js 20
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Audiveris via apt (avoids flaky wget from GitHub during build)
RUN apt-get update && \
    apt-get install -y audiveris && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

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
