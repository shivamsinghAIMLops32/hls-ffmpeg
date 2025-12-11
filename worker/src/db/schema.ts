import { pgTable, text, timestamp, boolean, integer, serial } from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const videoJobs = pgTable("video_jobs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  status: text("status", { enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] }).notNull().default("PENDING"),
  originalName: text("original_name").notNull(),
  originalUrl: text("original_url"),
  r2Key: text("r2_key").notNull(),
  hlsUrl: text("hls_url"),
  thumbnailUrl: text("thumbnail_url"),
  waveformUrl: text("waveform_url"),
  progress: integer("progress").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
