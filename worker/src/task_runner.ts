import { processJob } from "./processor.js";
import { Job } from "bullmq";

// Simple mock job object to adapt env vars to processor input
const jobData = {
    jobId: process.env.JOB_ID,
    r2Key: process.env.R2_KEY,
    userId: process.env.USER_ID
};

if (!jobData.jobId || !jobData.r2Key || !jobData.userId) {
    console.error("Missing required environment variables (JOB_ID, R2_KEY, USER_ID)");
    process.exit(1);
}

// Construct a mock Job-like object if processJob depends on specific Job methods
// In our case, processJob only uses `job.data`
const mockJob = {
    data: jobData,
    id: jobData.jobId
} as unknown as Job;

(async () => {
    try {
        console.log("Starting Ephemeral Task...");
        await processJob(mockJob);
        console.log("Ephemeral Task Finished Successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Ephemeral Task Failed:", error);
        process.exit(1);
    }
})();
