import { Worker } from "bullmq";
import { processJob } from "./processor.js";
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
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "1"),
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed!`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed with ${err}`);
});

console.log("Worker started, listening for jobs...");
