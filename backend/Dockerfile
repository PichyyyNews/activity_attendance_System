FROM node:20-alpine AS builder
WORKDIR /app/backend
COPY package*.json ./
RUN apk add --no-cache build-base python3
RUN npm ci
COPY . ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app/backend
COPY package*.json ./
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./package.json

EXPOSE 5000
CMD ["npm", "start"]
