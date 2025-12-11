import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs-extra";
import path from "path";
import { Readable } from "stream";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME || "video-saas";

export async function downloadFile(key: string, localPath: string) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  const response = await r2.send(command);
  if (!response.Body) throw new Error("No body in response");

  await fs.ensureDir(path.dirname(localPath));
  const writer = fs.createWriteStream(localPath);
  
  // @ts-ignore - ReadableStream/Node stream mismatch
  Readable.from(response.Body).pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

export async function uploadFile(key: string, localPath: string, contentType?: string) {
  const fileStream = fs.createReadStream(localPath);
  const upload = new Upload({
    client: r2,
    params: {
      Bucket: R2_BUCKET,
      Key: key,
      Body: fileStream,
      ContentType: contentType,
    },
  });

  await upload.done();
}
