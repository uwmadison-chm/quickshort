# Self-hosted image. No npm dependencies at runtime: Node runs the
# TypeScript directly (type stripping, Node >= 22.18).
#   docker build -t quickshort .
#   docker run -p 8080:8080 quickshort > hits.jsonl
# To use a different redirects dir, build with: --build-arg REDIRECTS_DIR=...
FROM node:22-alpine
WORKDIR /app
ARG REDIRECTS_DIR=redirects
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY ${REDIRECTS_DIR} ./redirects
RUN node scripts/build-redirects.ts redirects
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/entry/node.ts"]
