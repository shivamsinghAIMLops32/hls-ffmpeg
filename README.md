<<<<<<< HEAD
# Video Transcoding SaaS

A scalable, fault-tolerant video transcoding system built with Bun, Hono, Node.js, and FFmpeg.

## Features

- **Upload**: Direct-to-R2 (S3) uploads using signed URLs.
- **Transcoding**: Automatic conversion to HLS (m3u8) with multiple bitrates (1080p, 720p, 360p).
- **Processing**: Queue-based architecture using BullMQ and Redis.
- **Tracking**: Real-time progress updates and thumbnail generation.
- **Scaling**: Decoupled API and Worker services; Worker supports configurable concurrency.

## Tech Stack

- **API**: Bun, Hono, BetterAuth, Drizzle ORM (PostgreSQL).
- **Worker**: Node.js, Fluent-FFmpeg, BullMQ, AWS SDK (for R2).
- **Infrastructure**: Docker Compose, Redis.

## Application Structure

### `api/`

The web server handling authentication, upload orchestration, and job status queries.

- **`src/index.ts`**: Entrypoint and routes (`/upload/presigned`, `/upload/webhook`, `/jobs`).
- **`src/auth.ts`**: BetterAuth configuration.
- **`src/db/`**: Drizzle schema and connection.

### `worker/`

The background processor handling video manipulation.

- **`src/index.ts`**: Queue listener and concurrency management.
- **`src/processor.ts`**: Core logic (Download -> Transcode -> Thumbnail -> Upload).
- **`src/storage.ts`**: R2 helper functions.

## Setup & Running

1. **Environment Variables**:
   Ensure `.env` contains necessary credentials (DB, Redis, R2). See `walkthrough.md` for details.

2. **Run with Docker Compose**:

   ```bash
   docker-compose up --build
   ```

   This starts:

   - PostgreSQL (Port 5432)
   - Redis (Port 6379)
   - API Service (Port 3000)
   - Worker Service (Scalable)

3. **Development**:
   - **API**: `cd api && bun install && bun run dev`
   - **Worker**: `cd worker && npm install && npm run dev`

## API Endpoints

- `POST /upload/presigned`: Get S3/R2 presigned URL.
- `POST /upload/webhook`: Notify system of new upload.
- `GET /jobs`: List transcoding jobs with status, progress, and URLs.
=======
# Database
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=video_saas
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/video_saas
# Auth
BETTER_AUTH_SECRET=your_random_secret
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://pub-xxx.r2.dev
>>>>>>> 9259b408044e379bf9edfa66b8acafabab0b30b1
