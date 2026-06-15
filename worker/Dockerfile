FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV ZIPSNAP_HEADLESS=1
ENV ZIPSNAP_DOCKER=1

CMD ["npx", "tsx", "src/server.ts"]
