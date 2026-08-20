import { SignJWT, jwtVerify } from 'jose';

const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error('JWT_SECRET environment variable is not set');
}
const JWT_SECRET = new TextEncoder().encode(secret);

export interface JWTPayload {
  userId: string;
  nik: string;
  role: string;
  name: string;
}

function isValidPayload(p: unknown): p is JWTPayload {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as Record<string, unknown>).userId === 'string' &&
    typeof (p as Record<string, unknown>).nik === 'string' &&
    typeof (p as Record<string, unknown>).role === 'string' &&
    typeof (p as Record<string, unknown>).name === 'string'
  );
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!isValidPayload(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}
