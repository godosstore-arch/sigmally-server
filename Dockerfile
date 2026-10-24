FROM node:20
WORKDIR /app
COPY package*.json binding.gyp ./
COPY src ./src
RUN npm ci --include=dev || npm install
COPY . .
CMD ["node", "railway-start.js"]
