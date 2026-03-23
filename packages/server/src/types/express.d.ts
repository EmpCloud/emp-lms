// ============================================================================
// EXPRESS TYPE AUGMENTATIONS
// Extends Express Request with auth payload and fixes Express 5 param types.
// ============================================================================

import { AuthPayload } from "@emp-lms/shared";

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// Fix Express 5 ParamsDictionary — route params like :id are always strings
declare module "express-serve-static-core" {
  interface ParamsDictionary {
    [key: string]: string;
  }
}

export {};
