import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// NOTE: For an internal tool we trust the id_token returned over TLS directly
// from Microsoft's token endpoint and read the email claim to match an existing
// user. For production hardening, verify the JWT signature against the tenant's
// JWKS (https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys).
function decodeEmail(idToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as {
      preferred_username?: string;
      email?: string;
      upn?: string;
    };
    return (payload.preferred_username || payload.email || payload.upn || "").toLowerCase() || null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  if (!env.azureAd.enabled) return NextResponse.json({ error: "Azure AD SSO not configured" }, { status: 404 });
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = cookies().get("azure_state")?.value;
  if (!code || !state || state !== expected) return NextResponse.redirect(`${url.origin}/login?error=sso_state`);

  const redirectUri = `${url.origin}/api/auth/azure/callback`;
  const tokenRes = await fetch(`https://login.microsoftonline.com/${env.azureAd.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.azureAd.clientId,
      client_secret: env.azureAd.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      scope: "openid profile email",
    }),
  });
  if (!tokenRes.ok) return NextResponse.redirect(`${url.origin}/login?error=sso_token`);
  const token = (await tokenRes.json()) as { id_token?: string };
  const email = token.id_token ? decodeEmail(token.id_token) : null;
  if (!email) return NextResponse.redirect(`${url.origin}/login?error=sso_email`);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt || user.status !== "Active") {
    return NextResponse.redirect(`${url.origin}/login?error=sso_nouser`);
  }

  await createSession(user.id);
  await audit({ actorId: user.id, action: "login", entityType: "User", entityId: user.id, summary: `${user.name} signed in via Microsoft` });
  cookies().delete("azure_state");
  return NextResponse.redirect(`${url.origin}/dashboard`);
}
