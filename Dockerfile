# ScoreSense OMR Backend
# Audiveris jar is bundled in the repo — no network download during build

FROM eclipse-temurin:17-jdk-jammy

# Node.js 20
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy the Audiveris jar from the repo (you must have audiveris.jar in your backend folder)
RUN mkdir -p /opt/audiveris
COPY audiveris.jar /opt/audiveris/audiveris.jar

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
