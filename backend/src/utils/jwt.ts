import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// SECURITY: Fail fast at startup — never allow a fallback secret.
// If JWT_SECRET is missing, ANY attacker who reads the source can forge admin tokens.
// Crashing here is far safer than silently serving with a known secret.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is not set. ' +
    'Set it to a 64-character random string before starting the server.',
  );
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface JwtPayload {
  id:             string;
  role:           string;
  email:          string;
  name?:          string;
  // jti: unique token ID — allows per-token revocation via a blocklist if needed
  jti:            string;
  // tokenVersion: bumped on logout / password-change to invalidate all existing sessions.
  // Tokens that pre-date this field (undefined) are treated as backward-compatible.
  tokenVersion?:  number;
}

export const signToken = (payload: Omit<JwtPayload, 'jti'> & { jti?: string }): string => {
  // Always stamp a fresh jti so every issued token has a unique, revocable ID
  const tokenPayload: JwtPayload = {
    ...payload,
    jti: payload.jti ?? crypto.randomUUID(),
  };
  return jwt.sign(tokenPayload, JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, JWT_SECRET!) as JwtPayload;
};
