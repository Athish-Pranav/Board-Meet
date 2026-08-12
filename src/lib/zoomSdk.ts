import "server-only";
import { SignJWT } from "jose";
import { env } from "./env";

/**
 * Zoom Meeting SDK (web) — signature minting.
 *
 * The embedded Component View client can't hold the SDK secret, so the browser
 * asks the server for a short-lived signed JWT that authorises it to join one
 * specific meeting. Kept separate from src/lib/zoom.ts on purpose: that file
 * talks to the REST API with Server-to-Server OAuth credentials, this one signs
 * locally with a different app's credentials and never calls Zoom at all.
 *
 * See https://developers.zoom.us/docs/meeting-sdk/auth/
 */

// Zoom requires the signature to live at least 30 minutes and at most 48 hours.
// Two hours comfortably outlives a board meeting without minting long-lived
// credentials.
const SIGNATURE_TTL_SECONDS = 2 * 60 * 60;

export const ZOOM_SDK_ROLE_PARTICIPANT = 0;
export const ZOOM_SDK_ROLE_HOST = 1;

/**
 * Signs a Meeting SDK JWT for a single meeting. Callers must have already
 * checked that the current user is allowed into that meeting — this function
 * makes no authorisation decisions of its own.
 */
export async function generateMeetingSdkSignature(input: {
  meetingNumber: string;
  role?: number;
}): Promise<string | null> {
  if (!env.zoom.sdkEnabled) return null;
  try {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + SIGNATURE_TTL_SECONDS;
    const secret = new TextEncoder().encode(env.zoom.sdkClientSecret);

    // appKey and sdkKey are both the SDK app's Client ID. Since SDK v5 the
    // signature must carry appKey or the client is rejected at join time.
    return await new SignJWT({
      appKey: env.zoom.sdkClientId,
      sdkKey: env.zoom.sdkClientId,
      mn: input.meetingNumber,
      role: input.role ?? ZOOM_SDK_ROLE_PARTICIPANT,
      iat,
      exp,
      tokenExp: exp,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(secret);
  } catch (err) {
    // Best-effort, matching src/lib/zoom.ts: a signing failure downgrades the
    // meeting room to the plain Zoom link rather than breaking the page.
    console.error("[zoom-sdk] failed to sign meeting signature", err);
    return null;
  }
}
