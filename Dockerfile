FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production --build-from-source=sqlite3

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
