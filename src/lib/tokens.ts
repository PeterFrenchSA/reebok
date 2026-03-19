import { createHash, randomBytes, timingSafeEqual } from "crypto";

const TOKEN_HASH_PREFIX = "sha256:";

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function generateOpaqueToken(byteLength = 24): string {
  return randomBytes(byteLength).toString("hex");
}

export function hashOpaqueToken(token: string): string {
  const digest = createHash("sha256").update(token).digest("hex");
  return `${TOKEN_HASH_PREFIX}${digest}`;
}

export function isOpaqueTokenHash(token: string): boolean {
  return token.startsWith(TOKEN_HASH_PREFIX);
}

export function opaqueTokenCandidates(token: string): string[] {
  if (isOpaqueTokenHash(token)) {
    return [];
  }

  const hashed = hashOpaqueToken(token);
  return hashed === token ? [token] : [hashed, token];
}

export function opaqueTokensMatch(storedToken: string | null | undefined, providedToken: string | null | undefined): boolean {
  if (!storedToken || !providedToken || isOpaqueTokenHash(providedToken)) {
    return false;
  }

  return opaqueTokenCandidates(providedToken).some((candidate) => safeEqual(storedToken, candidate));
}
