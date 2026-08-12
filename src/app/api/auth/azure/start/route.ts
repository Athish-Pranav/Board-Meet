import { NextResponse } from "next/server";
import crypto from "crypto";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!env.azureAd.enabled) return NextResponse.json({ error: "Azure AD SSO not configured" }, { status: 404 });

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/azure/callback`;
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: env.azureAd.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state,
  });
  const authorizeUrl = `https://login.microsoftonline.com/${env.azureAd.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("azure_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return res;
}
