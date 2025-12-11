import { Worker } from "bullmq";
import Docker from "dockerode";
import dotenv from "dotenv";

dotenv.config();

const docker = new Docker();

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
};

const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "1");

console.log(`Starting Orchestrator with concurrency: ${concurrency}`);

const worker = new Worker(
  "transcode_queue",
  async (job) => {
    console.log(`[Orchestrator] Spawning container for job ${job.id}`);
    const { jobId, r2Key, userId } = job.data;

    // TODO: Ensure image 'hls-saas-worker:latest' exists or pull it
    // In Docker Compose, it should be built locally.

    try {
      const container = await docker.createContainer({
        Image: "hls-saas-worker:latest",
        Cmd: ["npm", "run", "task"], // Override CMD to run task_runner
        Env: [
           `JOB_ID=${jobId}`,
           `R2_KEY=${r2Key}`,
           `USER_ID=${userId}`,
           `DATABASE_URL=${process.env.DATABASE_URL}`,
           `R2_ACCOUNT_ID=${process.env.R2_ACCOUNT_ID}`,
           `R2_ACCESS_KEY_ID=${process.env.R2_ACCESS_KEY_ID}`,
           `R2_SECRET_ACCESS_KEY=${process.env.R2_SECRET_ACCESS_KEY}`,
           `R2_BUCKET_NAME=${process.env.R2_BUCKET_NAME}`,
           `R2_PUBLIC_URL=${process.env.R2_PUBLIC_URL}`
        ],
        HostConfig: {
            NetworkMode: "hls_network", // vital for connecting to DB/Redis
            AutoRemove: true // Ephemeral: Destroy on exit
        }
      });

      console.log(`[Orchestrator] Container created: ${container.id.substring(0, 12)}`);
      await container.start();
      
      // Wait for container to exit
      const stream = await container.wait();
      // 'stream' contains StatusCode
      if (stream.StatusCode !== 0) {
          throw new Error(`Container exited with code ${stream.StatusCode}`);
      }

      console.log(`[Orchestrator] Container finished job ${job.id}`);

    } catch (err) {
      console.error(`[Orchestrator] Failed to spawn/run container for job ${job.id}`, err);
      throw err;
    }
  },
  {
    connection,
    concurrency, 
    lockDuration: 300000, // 5 mins lock while container runs (container might take longer, adjust accordingly)
  }
);

worker.on("completed", (job) => {
  console.log(`[Orchestrator] Job ${job.id} marked as completed.`);
});

worker.on("failed", (job, err) => {
  console.error(`[Orchestrator] Job ${job?.id} failed with ${err}`);
});
