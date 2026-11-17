FROM node:22-bookworm-slim
WORKDIR /job
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY jobs.cjs cli.cjs ./
USER node
ENTRYPOINT ["node", "cli.cjs"]
