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
  
  await fs.ensureDir(workDir);
  await fs.ensureDir(outputDir);

  try {
    // 1. Update Status to PROCESSING
    await db.update(videoJobs).set({ status: "PROCESSING", progress: 0 }).where(eq(videoJobs.id, jobId));

    // 2. Download Video
    console.log("Downloading video...");
    await downloadFile(r2Key, inputPath);

    // Analyze Video
    console.log("Analyzing video metadata...");
    const metadata = await new Promise<ffmpeg.FfmpegStreamMetadata>((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) reject(err);
            else resolve(metadata);
        });
    });

    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    const height = videoStream?.height || 1080; // Default to 1080 if unknown logic
    console.log(`Input video height: ${height}`);

    // 3. Generate Thumbnail
    console.log("Generating thumbnail...");
    await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
            .screenshots({
                timestamps: ['20%'],
                filename: 'thumbnail.jpg',
                folder: outputDir,
                size: '320x?' 
            })
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });

    // 4. Generate Waveform
    console.log("Generating audio waveform...");
    const waveformPath = path.join(outputDir, "waveform.png");
    await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
            .complexFilter([
                "[0:a]aformat=channel_layouts=mono,showwavespic=s=640x120:colors=cyan|black[out]"
            ])
            .map("[out]")
            .output(waveformPath)
            .frames(1)
            .on("end", () => resolve())
            .on("error", (err) => {
                console.error("Waveform generation failed (maybe no audio?), skipping.", err);
                resolve(); // Non-critical, resolve anyway
            })
            .run();
    });

    // 5. Transcode to HLS (Adaptive)
    console.log("Transcoding...");
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(inputPath);
      
      // Construct complex filter and maps dynamically
      const variants: { name: string, height: number, bitrate: string, maxrate: string, bufsize: string, audioBitrate: string }[] = [];
      
      if (height >= 1080) variants.push({ name: "1080p", height: 1080, bitrate: "5000k", maxrate: "5350k", bufsize: "7500k", audioBitrate: "192k" });
      if (height >= 720) variants.push({ name: "720p", height: 720, bitrate: "2800k", maxrate: "2996k", bufsize: "4200k", audioBitrate: "128k" });
      if (height >= 360) variants.push({ name: "360p", height: 360, bitrate: "800k", maxrate: "856k", bufsize: "1200k", audioBitrate: "96k" });
      
      // Fallback if very low res or logic fail
      if (variants.length === 0) {
         variants.push({ name: "360p", height: 360, bitrate: "800k", maxrate: "856k", bufsize: "1200k", audioBitrate: "96k" });
      }

      let complexFilter = `[0:v]split=${variants.length}`;
      variants.forEach((v, i) => complexFilter += `[v${i}]`);
      complexFilter += ";";
      
      variants.forEach((v, i) => {
          complexFilter += `[v${i}]scale=w=-2:h=${v.height}:force_original_aspect_ratio=decrease[v${i}out];`;
          
          command.outputOptions([
              `-map [v${i}out]`, 
              `-c:v:${i} libx264`, 
              `-b:v:${i} ${v.bitrate}`, 
              `-maxrate:v:${i} ${v.maxrate}`, 
              `-bufsize:v:${i} ${v.bufsize}`,
              `-map a:0`, 
              `-c:a:${i} aac`, 
              `-b:a:${i} ${v.audioBitrate}`
          ]);
      });

      // Remove trailing semicolon
    //   if (complexFilter.endsWith(";")) complexFilter = complexFilter.slice(0, -1);
      
      // Actually, fluent-ffmpeg complexFilter input is array of strings or single string. 
      // The split logic is simpler if we just chain strings.
      
      command.complexFilter(complexFilter);

      const varStreamMap = variants.map((v, i) => `v:${i},a:${i},name:${v.name}`).join(" ");

      command
        .outputOptions([
            '-f hls',
            '-hls_time 10',
            '-hls_list_size 0',
            '-hls_segment_type mpegts',
            '-master_pl_name index.m3u8',
            `-var_stream_map ${varStreamMap}`
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

    // 6. Upload Files
    console.log("Uploading files...");
    const r2OutputPrefix = `hls/${userId}/${jobId}`;
    
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
                let contentType = "application/octet-stream";
                if (file.endsWith(".m3u8")) contentType = "application/vnd.apple.mpegurl";
                if (file.endsWith(".ts")) contentType = "video/mp2t";
                if (file.endsWith(".jpg")) contentType = "image/jpeg";
                if (file.endsWith(".png")) contentType = "image/png";
                
                await uploadFile(key, fullPath, contentType);
            }
        }
    };
    await uploadDir(outputDir, outputDir);

    const masterPlaylistUrl = `${process.env.R2_PUBLIC_URL}/${r2OutputPrefix}/index.m3u8`;
    const thumbnailUrl = `${process.env.R2_PUBLIC_URL}/${r2OutputPrefix}/thumbnail.jpg`;
    
    // Check if waveform exists
    const hasWaveform = await fs.pathExists(path.join(outputDir, "waveform.png"));
    const waveformUrl = hasWaveform ? `${process.env.R2_PUBLIC_URL}/${r2OutputPrefix}/waveform.png` : null;

    // 7. Update DB
    await db.update(videoJobs).set({
      status: "COMPLETED",
      progress: 100,
      hlsUrl: masterPlaylistUrl,
      thumbnailUrl: thumbnailUrl,
      waveformUrl: waveformUrl,
    }).where(eq(videoJobs.id, jobId));

    console.log("Job completed successfully.");

  } catch (error) {
    console.error("Job failed:", error);
    await db.update(videoJobs).set({ status: "FAILED" }).where(eq(videoJobs.id, jobId));
    throw error;
  } finally {
    // 8. Cleanup
    await fs.remove(workDir);
  }
}
