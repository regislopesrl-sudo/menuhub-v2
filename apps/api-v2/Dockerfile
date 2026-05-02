FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci
RUN npm run prisma:generate --workspace @delivery-futuro/api-v2
RUN npm run build --workspace @delivery-futuro/shared-types
RUN npm run build --workspace @delivery-futuro/order-core
RUN npm run build --workspace @delivery-futuro/api-v2

EXPOSE 3202

CMD ["npm", "run", "start", "--workspace", "@delivery-futuro/api-v2"]
