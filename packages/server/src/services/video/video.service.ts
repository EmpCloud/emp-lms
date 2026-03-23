// ============================================================================
// VIDEO SERVICE
// Video content upload, metadata, and management.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { getDB } from "../../db/adapters/index";
import { config } from "../../config/index";
import { logger } from "../../utils/logger";
import { NotFoundError, BadRequestError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Upload Video
// ---------------------------------------------------------------------------

export async function uploadVideo(
  orgId: number,
  file: Express.Multer.File
): Promise<{
  id: string;
  url: string;
  originalName: string;
  size: number;
  mimeType: string;
  duration: number;
}> {
  if (!file) {
    throw new BadRequestError("No video file provided.");
  }

  const videoDir = path.resolve(config.upload.uploadDir, "videos", String(orgId));
  fs.mkdirSync(videoDir, { recursive: true });

  const ext = path.extname(file.originalname);
  const videoId = uuidv4();
  const fileName = `${videoId}${ext}`;
  const destPath = path.join(videoDir, fileName);

  // Move uploaded file to the videos directory
  try {
    fs.renameSync(file.path, destPath);
  } catch {
    // If rename fails (cross-device), copy and delete
    fs.copyFileSync(file.path, destPath);
    try {
      fs.unlinkSync(file.path);
    } catch {
      // Non-critical
    }
  }

  const url = `/uploads/videos/${orgId}/${fileName}`;

  // Get metadata
  const metadata = await getVideoMetadata(destPath);

  logger.info(`Video uploaded: ${file.originalname} -> ${url} (${file.size} bytes)`);

  return {
    id: videoId,
    url,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
    duration: metadata.duration,
  };
}

// ---------------------------------------------------------------------------
// Get Video URL
// ---------------------------------------------------------------------------

export async function getVideoUrl(
  orgId: number,
  videoId: string
): Promise<{ url: string }> {
  const videoDir = path.resolve(config.upload.uploadDir, "videos", String(orgId));

  // Find the video file by ID prefix
  let videoFile: string | null = null;

  if (fs.existsSync(videoDir)) {
    const files = fs.readdirSync(videoDir);
    videoFile = files.find((f) => f.startsWith(videoId)) || null;
  }

  if (!videoFile) {
    throw new NotFoundError("Video", videoId);
  }

  const url = `/uploads/videos/${orgId}/${videoFile}`;

  return { url };
}

// ---------------------------------------------------------------------------
// Delete Video
// ---------------------------------------------------------------------------

export async function deleteVideo(
  orgId: number,
  videoPath: string
): Promise<void> {
  // Ensure the path is within the org's video directory to prevent directory traversal
  const videoDir = path.resolve(config.upload.uploadDir, "videos", String(orgId));
  const fullPath = path.resolve(config.upload.uploadDir, videoPath);

  if (!fullPath.startsWith(videoDir)) {
    throw new BadRequestError("Invalid video path.");
  }

  if (!fs.existsSync(fullPath)) {
    throw new NotFoundError("Video file", videoPath);
  }

  fs.unlinkSync(fullPath);

  logger.info(`Video deleted: ${videoPath}`);
}

// ---------------------------------------------------------------------------
// Get Video Metadata
// ---------------------------------------------------------------------------

export async function getVideoMetadata(
  filePath: string
): Promise<{ size: number; duration: number }> {
  let size = 0;
  let duration = 0;

  // Get file size
  try {
    const stats = fs.statSync(filePath);
    size = stats.size;
  } catch {
    // File may not exist
  }

  // Try to get duration using ffprobe if available
  try {
    duration = await new Promise<number>((resolve) => {
      execFile(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          filePath,
        ],
        { timeout: 10000 },
        (error, stdout) => {
          if (error) {
            resolve(0);
            return;
          }
          const parsed = parseFloat(stdout.trim());
          resolve(isNaN(parsed) ? 0 : Math.round(parsed));
        }
      );
    });
  } catch {
    // ffprobe not available, duration remains 0
    duration = 0;
  }

  return { size, duration };
}
