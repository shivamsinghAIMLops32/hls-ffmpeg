import { Queue } from "bullmq";

export const transcodeQueue = new Queue("transcode_queue", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
});
