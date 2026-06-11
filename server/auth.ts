/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Authentication middleware and helpers for Lumina.
 *
 * Uses bcryptjs for password hashing and jsonwebtoken for session tokens.
 * Two middleware variants:
 *   - authMiddleware: sets req.userId (allows anonymous with fallback)
 *   - requireAuth: rejects unauthenticated requests with 401
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('FATAL: JWT_SECRET must be set in production. Generate one with: openssl rand -hex 32'); })()
  : 'lumina-dev-secret-DO-NOT-USE-IN-PROD');
const JWT_EXPIRY = '7d';
const SALT_ROUNDS = 10;

export interface AuthPayload {
  userId: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

/**
 * Middleware that extracts userId from Bearer token.
 * Falls back to 'u-migrated' for anonymous/unauthenticated requests
 * so existing endpoints keep working without auth.
 */
export function authMiddleware(req: any, _res: any, next: any): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    req.userId = 'u-migrated';
    return next();
  }
  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    // Invalid token — still allow access as anonymous
    req.userId = 'u-migrated';
    return next();
  }
  req.userId = payload.userId;
  req.userEmail = payload.email;
  next();
}

/**
 * Strict auth middleware — rejects unauthenticated requests.
 * Use for sensitive endpoints (payments, account settings).
 */
export function requireAuth(req: any, res: any, next: any): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  req.userId = payload.userId;
  req.userEmail = payload.email;
  next();
}
