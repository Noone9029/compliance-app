import { cookies } from "next/headers";

import { PlatformClient } from "@daftar/sdk";

export const apiBaseUrl =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

async function getServerCookieHeader() {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export async function createServerPlatformClient() {
  const cookieHeader = await getServerCookieHeader();

  return new PlatformClient({
    baseUrl: apiBaseUrl,
    headers: cookieHeader ? { cookie: cookieHeader } : undefined
  });
}

export async function fetchServerJson<T>(path: string, init?: RequestInit) {
  const cookieHeader = await getServerCookieHeader();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
