import { Worker } from "bullmq";
import { processJob } from "./processor";
import dotenv from "dotenv";

dotenv.config();

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
};

const worker = new Worker(
  "transcode_queue",
  async (job) => {
    console.log(`Processing job ${job.id}`);
    await processJob(job);
  },
  {
    connection,
    concurrency: 1, // Process one video at a time per container
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed!`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed with ${err}`);
});

console.log("Worker started, listening for jobs...");
