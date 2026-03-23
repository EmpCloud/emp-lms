import multer, { FileFilterCallback } from "multer";
import path from "path";
import { Request } from "express";
import { v4 as uuidv4 } from "uuid";
import { config } from "../../config";
import { AppError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Storage configuration
// ---------------------------------------------------------------------------

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, config.upload.uploadDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// ---------------------------------------------------------------------------
// File filter factories
// ---------------------------------------------------------------------------

function createFileFilter(allowedTypes: readonly string[]) {
  return (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, "INVALID_FILE_TYPE", `File type '${file.mimetype}' is not allowed. Allowed types: ${allowedTypes.join(", ")}`));
    }
  };
}

// ---------------------------------------------------------------------------
// Upload middleware factories
// ---------------------------------------------------------------------------

interface UploadOptions {
  maxFileSize?: number;
  allowedTypes?: readonly string[];
}

/**
 * Single file upload middleware.
 */
export function uploadFile(fieldName: string, options?: UploadOptions) {
  const allowedTypes = options?.allowedTypes || [
    ...config.upload.allowedImageTypes,
    ...config.upload.allowedDocTypes,
  ];

  const upload = multer({
    storage,
    limits: {
      fileSize: options?.maxFileSize || config.upload.maxFileSize,
    },
    fileFilter: createFileFilter(allowedTypes),
  });

  return upload.single(fieldName);
}

/**
 * Multiple files upload middleware.
 */
export function uploadFiles(fieldName: string, maxCount: number, options?: UploadOptions) {
  const allowedTypes = options?.allowedTypes || [
    ...config.upload.allowedImageTypes,
    ...config.upload.allowedDocTypes,
  ];

  const upload = multer({
    storage,
    limits: {
      fileSize: options?.maxFileSize || config.upload.maxFileSize,
    },
    fileFilter: createFileFilter(allowedTypes),
  });

  return upload.array(fieldName, maxCount);
}

/**
 * SCORM ZIP file upload middleware.
 */
export function uploadScorm(fieldName: string) {
  const upload = multer({
    storage,
    limits: {
      fileSize: config.upload.maxScormSize,
    },
    fileFilter: createFileFilter(config.upload.allowedScormTypes),
  });

  return upload.single(fieldName);
}

/**
 * Video file upload middleware (large size limit).
 */
export function uploadVideo(fieldName: string) {
  const upload = multer({
    storage,
    limits: {
      fileSize: config.upload.maxVideoSize,
    },
    fileFilter: createFileFilter(config.upload.allowedVideoTypes),
  });

  return upload.single(fieldName);
}
