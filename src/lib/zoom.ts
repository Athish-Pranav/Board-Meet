import "server-only";
import { env } from "./env";

/**
 * Zoom REST API (Server-to-Server OAuth) — creates/updates/cancels a real Zoom
 * meeting so directors can join in Zoom's own app/web client. Best-effort: every
 * exported function catches its own errors and returns null/false rather than
 * throwing, so a Zoom outage or misconfiguration never blocks creating, editing,
 * or cancelling a board meeting in our own database.
 */

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getZoomAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const basic = Buffer.from(`${env.zoom.clientId}:${env.zoom.clientSecret}`).toString("base64");
  const res = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "account_credentials", account_id: env.zoom.accountId }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Zoom OAuth token request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  // Cache for the token's lifetime minus a safety buffer (tokens last ~1h, no refresh token).
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}

type ZoomMeetingResponse = { id: number; join_url: string; password?: string };

export async function createZoomMeeting(input: { topic: string; startTime: Date; durationMinutes?: number }): Promise<{ zoomMeetingId: string; joinUrl: string; passcode: string | null } | null> {
  if (!env.zoom.enabled) return null;
  try {
    const token = await getZoomAccessToken();
    const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        topic: input.topic,
        type: 2, // scheduled meeting
        start_time: input.startTime.toISOString(),
        timezone: "UTC",
        duration: input.durationMinutes ?? 60,
        settings: { join_before_host: true, waiting_room: false },
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[zoom] create meeting failed", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as ZoomMeetingResponse;
    // The plain passcode is only ever returned here — the ?pwd= in join_url is an
    // encrypted form the Meeting SDK's join() won't accept, so store this now.
    return { zoomMeetingId: String(data.id), joinUrl: data.join_url, passcode: data.password ?? null };
  } catch (err) {
    console.error("[zoom] create meeting request failed", err);
    return null;
  }
}

export async function updateZoomMeeting(zoomMeetingId: string, input: { topic?: string; startTime?: Date; durationMinutes?: number }): Promise<boolean> {
  if (!env.zoom.enabled) return false;
  try {
    const token = await getZoomAccessToken();
    const res = await fetch(`https://api.zoom.us/v2/meetings/${zoomMeetingId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        ...(input.topic ? { topic: input.topic } : {}),
        ...(input.startTime ? { start_time: input.startTime.toISOString(), timezone: "UTC" } : {}),
        ...(input.durationMinutes ? { duration: input.durationMinutes } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[zoom] update meeting failed", res.status, await res.text());
      return false;
    }
    return true; // 204 No Content on success
  } catch (err) {
    console.error("[zoom] update meeting request failed", err);
    return false;
  }
}

export async function deleteZoomMeeting(zoomMeetingId: string): Promise<boolean> {
  if (!env.zoom.enabled) return false;
  try {
    const token = await getZoomAccessToken();
    const res = await fetch(`https://api.zoom.us/v2/meetings/${zoomMeetingId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[zoom] delete meeting failed", res.status, await res.text());
      return false;
    }
    return true; // 204 No Content on success
  } catch (err) {
    console.error("[zoom] delete meeting request failed", err);
    return false;
  }
}
