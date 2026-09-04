// Password hashing (ARCHITECTURE section 5): bcryptjs at cost 12. The seed hashes the demo and Admin passwords
// with hashPassword and re-hashes only when verifyPassword says the stored hash no longer matches the environment.
import { compare, hash } from "bcryptjs";

export const BCRYPT_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}
