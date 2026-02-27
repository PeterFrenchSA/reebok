import { randomBytes } from "crypto";

export function generateBookingManageToken(): string {
  return randomBytes(24).toString("hex");
}

export function tokensMatch(tokenA: string | null | undefined, tokenB: string | null | undefined): boolean {
  if (!tokenA || !tokenB) {
    return false;
  }
  return tokenA === tokenB;
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
