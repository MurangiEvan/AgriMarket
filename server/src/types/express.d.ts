import type { userRole } from '../db/schema.js';

declare global {
  namespace Express {
    interface Request {
      cookies?: Record<string, string>;
      auth?: {
        id: string;
        role: (typeof userRole.enumValues)[number];
        email: string;
        sessionId: string;
      };
    }
  }
}

export {};