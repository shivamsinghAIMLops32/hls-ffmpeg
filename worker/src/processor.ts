import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs-extra";
import { db } from "./db/index.js";
import { videoJobs } from "./db/schema.js";
import { downloadFile, uploadFile } from "./storage.js";
import { eq } from "drizzle-orm";
import { Job } from "bullmq";

// Ensure temp directory exists
const TEMP_DIR = path.resolve("temp");
fs.ensureDirSync(TEMP_DIR);

export async function processJob(job: Job) {
  const { jobId, r2Key, userId } = job.data;
  console.log(`Processing Job ID: ${jobId}, Key: ${r2Key}`);

  const workDir = path.join(TEMP_DIR, `job-${jobId}`);
  const inputPath = path.join(workDir, "input.mp4");
  const outputDir = path.join(workDir, "output");
  const thumbnailPath = path.join(outputDir, "thumbnail.jpg");

  await fs.ensureDir(workDir);
  await fs.ensureDir(outputDir);

  try {
    // 1. Update Status to PROCESSING
    await db.update(videoJobs).set({ status: "PROCESSING", progress: 0 }).where(eq(videoJobs.id, jobId));

    // 2. Download Video
    console.log("Downloading video...");
    await downloadFile(r2Key, inputPath);

    // 3. Generate Thumbnail (Seek 20%)
    console.log("Generating thumbnail...");
    await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
            .screenshots({
                timestamps: ['20%'],
                filename: 'thumbnail.jpg',
                folder: outputDir,
                size: '320x?' // Fit width, keep aspect ratio
            })
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });

    // 4. Transcode to HLS (360p, 720p, 1080p)
    console.log("Transcoding...");
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
             // 360p Stream
            '-filter_complex [0:v]split=3[v1][v2][v3]; [v1]scale=w=640:h=360:force_original_aspect_ratio=decrease[v1out]; [v2]scale=w=1280:h=720:force_original_aspect_ratio=decrease[v2out]; [v3]scale=w=1920:h=1080:force_original_aspect_ratio=decrease[v3out]',
            
            // Map streams
            '-map [v1out] -c:v:0 libx264 -b:v:0 800k -maxrate:v:0 856k -bufsize:v:0 1200k', // 360p
            '-map [v2out] -c:v:1 libx264 -b:v:1 2800k -maxrate:v:1 2996k -bufsize:v:1 4200k', // 720p
            '-map [v3out] -c:v:2 libx264 -b:v:2 5000k -maxrate:v:2 5350k -bufsize:v:2 7500k', // 1080p
            
            // Audio (Copy to all variants)
            '-map a:0 -c:a:0 aac -b:a:0 96k',
            '-map a:0 -c:a:1 aac -b:a:1 128k',
            '-map a:0 -c:a:2 aac -b:a:2 192k',

            // HLS Settings
            '-f hls',
            '-hls_time 10',
            '-hls_list_size 0',
            '-hls_segment_type mpegts',
            '-master_pl_name index.m3u8',
            
            // Variant Stream Mapping
            '-var_stream_map v:0,a:0,name:360p v:1,a:1,name:720p v:2,a:2,name:1080p'
        ])
        .output(path.join(outputDir, '%v/playlist.m3u8'))
        .on('progress', async (progress) => {
            if (progress.percent) {
                const p = Math.round(progress.percent);
                console.log(`Progress: ${p}%`);
            }
        })
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    // 5. Upload HLS Files & Thumbnail
    console.log("Uploading files...");
    const r2OutputPrefix = `hls/${userId}/${jobId}`;
    
    // Helper to recursive upload
    const uploadDir = async (dir: string, baseDir: string) => {
        const files = await fs.readdir(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = await fs.stat(fullPath);
            if (stat.isDirectory()) {
                await uploadDir(fullPath, baseDir);
            } else {
                const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
                const key = `${r2OutputPrefix}/${relativePath}`;
                // Mime types
                let contentType = "application/octet-stream";
                if (file.endsWith(".m3u8")) contentType = "application/vnd.apple.mpegurl";
                if (file.endsWith(".ts")) contentType = "video/mp2t";
                if (file.endsWith(".jpg")) contentType = "image/jpeg";
                
                await uploadFile(key, fullPath, contentType);
            }
        }
    };
    await uploadDir(outputDir, outputDir);

    const masterPlaylistUrl = `${process.env.R2_PUBLIC_URL}/${r2OutputPrefix}/index.m3u8`;
    const thumbnailUrl = `${process.env.R2_PUBLIC_URL}/${r2OutputPrefix}/thumbnail.jpg`;

    // 6. Update Status to COMPLETED
    await db.update(videoJobs).set({
      status: "COMPLETED",
      progress: 100,
      hlsUrl: masterPlaylistUrl,
      thumbnailUrl: thumbnailUrl
    }).where(eq(videoJobs.id, jobId));

    console.log("Job completed successfully.");

  } catch (error) {
    console.error("Job failed:", error);
    await db.update(videoJobs).set({ status: "FAILED" }).where(eq(videoJobs.id, jobId));
    throw error;
  } finally {
    // 7. Cleanup
    await fs.remove(workDir);
  }
}
