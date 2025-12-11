FROM node:20-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Create temp dir
RUN mkdir -p temp

CMD ["npm", "start"]
