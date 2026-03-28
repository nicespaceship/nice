FROM node:20-alpine AS base
WORKDIR /app

# Copy static files
COPY index.html .
COPY app/ ./app/
COPY assets/ ./assets/
COPY public/ ./public/
COPY LICENSE .
COPY CONTRIBUTING.md .

# Serve with a lightweight static server
RUN npm install -g serve@14

EXPOSE 3000
CMD ["serve", "-s", ".", "-l", "3000"]
