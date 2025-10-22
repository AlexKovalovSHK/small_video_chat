# Step 1: Build Stage
FROM node:20-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (if exists)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Build the NestJS application
RUN npm run build

# Step 2: Runtime Stage
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy only the built files and node_modules from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Expose the application's port (change if needed)
EXPOSE 3010

# Start the application
#CMD ["node", "dist/main"]
CMD ["node", "dist/src/main.js"]