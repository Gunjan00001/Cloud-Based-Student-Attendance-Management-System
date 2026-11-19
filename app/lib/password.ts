import { hash, verify } from "@node-rs/argon2";

// The library defaults to Argon2id, which is what we want.
const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string) {
  return hash(password, options);
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}
