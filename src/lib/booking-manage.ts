import { generateOpaqueToken, hashOpaqueToken, opaqueTokensMatch } from "@/lib/tokens";

export function generateBookingManageToken(): string {
  return generateOpaqueToken(24);
}

export function hashBookingManageToken(token: string): string {
  return hashOpaqueToken(token);
}

export function tokensMatch(storedToken: string | null | undefined, providedToken: string | null | undefined): boolean {
  return opaqueTokensMatch(storedToken, providedToken);
}

export function getAppBaseUrl(): string {
  const value = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function buildManageBookingUrl(reference: string, token?: string, email?: string): string {
  const url = new URL("/booking/manage", getAppBaseUrl());
  url.searchParams.set("reference", reference);
  if (token) {
    url.searchParams.set("token", token);
  }
  if (email) {
    url.searchParams.set("email", email);
  }
  return url.toString();
}
