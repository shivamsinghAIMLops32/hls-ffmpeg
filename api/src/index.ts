import { Hono } from "hono";
import { auth } from "./auth";
import { generatePresignedUrl } from "./storage";
import { db } from "./db";
import { videoJobs } from "./db/schema";
import { transcodeQueue } from "./queue";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const app = new Hono();

// Auth Routes (BetterAuth)
app.on(["POST", "GET"], "/api/auth/**", (c) => {
    return auth.handler(c.req.raw);
});

// Middleware to get user session
const getSession = async (c: any) => {
    const session = await auth.api.getSession({
        headers: c.req.raw.headers,
    });
    return session;
};

// Protected Routes Middleware or individual checks
// POST /upload/presigned
app.post("/upload/presigned", async (c) => {
    const session = await getSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const { fileName, contentType } = await c.req.json();
    const uniqueId = uuidv4();
    const key = `raw/${session.user.id}/${uniqueId}-${fileName}`;

    try {
        const url = await generatePresignedUrl(key, contentType);
        return c.json({ url, key });
    } catch (error) {
        console.error("Error generating presigned URL:", error);
        return c.json({ error: "Internal Server Error" }, 500);
    }
});

// POST /upload/webhook
app.post("/upload/webhook", async (c) => {
    const session = await getSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const { r2Key, originalName } = await c.req.json();

    // Create DB Record
    const [job] = await db.insert(videoJobs).values({
        userId: session.user.id,
        r2Key,
        originalName,
        status: "PENDING",
    }).returning();

    // Push to Queue
    await transcodeQueue.add("transcode", {
        jobId: job.id,
        r2Key,
        userId: session.user.id
    });

    return c.json({ success: true, job });
});

// GET /jobs
app.get("/jobs", async (c) => {
    const session = await getSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const jobs = await db.select()
        .from(videoJobs)
        .where(eq(videoJobs.userId, session.user.id))
        .orderBy(desc(videoJobs.createdAt));

    return c.json(jobs);
});

export default app;
