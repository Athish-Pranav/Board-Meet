// Typed access to environment configuration with sensible local defaults.
//
// Defaults exist for local development only. In production the guard at the
// bottom of this file refuses to boot on a placeholder secret, so a misconfigured
// deployment fails loudly at startup rather than silently running insecurely.

const isProd = process.env.NODE_ENV === "production";

const INSECURE_SECRETS = new Set([
  "dev-insecure-secret-change-me",
  "local-dev-secret",
  "changeme",
  "secret",
]);

export const env = {
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  authSecret: process.env.AUTH_SECRET || "dev-insecure-secret-change-me",
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || "12"),

  storageDriver: (process.env.STORAGE_DRIVER || "db") as "local" | "s3" | "db",
  storageLocalDir: process.env.STORAGE_LOCAL_DIR || "./storage",
  s3: {
    endpoint: process.env.S3_ENDPOINT || "",
    region: process.env.S3_REGION || "ap-south-1",
    bucket: process.env.S3_BUCKET || "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },

  notifyDriver: (process.env.NOTIFY_DRIVER || "log") as "log" | "smtp",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || "587"),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Board Secretariat <board@example.com>",
  },

  azureAd: {
    clientId: process.env.AZURE_AD_CLIENT_ID || "",
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET || "",
    tenantId: process.env.AZURE_AD_TENANT_ID || "",
    get enabled() {
      return Boolean(
        process.env.AZURE_AD_CLIENT_ID &&
          process.env.AZURE_AD_CLIENT_SECRET &&
          process.env.AZURE_AD_TENANT_ID,
      );
    },
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
    get enabled() {
      return Boolean(process.env.ANTHROPIC_API_KEY);
    },
  },

  // Zoom, in two independent halves — both best-effort, neither boot-critical.
  //
  //  1. REST API (Server-to-Server OAuth): creates/updates/cancels a real Zoom
  //     meeting when a Video/Hybrid board meeting is scheduled. From a
  //     "Server to Server OAuth" app at marketplace.zoom.us. Without it,
  //     meetings fall back to a manually-entered link.
  //  2. Meeting SDK: lets that same meeting be embedded directly in the
  //     Meeting Room page, so directors don't alt-tab between Zoom and the
  //     agenda/voting. From a *separate* "General App" with Features → Embed →
  //     Meeting SDK toggled on. Without it, the room degrades to the plain
  //     "Join Zoom Meeting" link.
  zoom: {
    accountId: process.env.ZOOM_ACCOUNT_ID || "",
    clientId: process.env.ZOOM_CLIENT_ID || "",
    clientSecret: process.env.ZOOM_CLIENT_SECRET || "",
    get enabled() {
      return Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
    },
    sdkClientId: process.env.ZOOM_SDK_CLIENT_ID || "",
    sdkClientSecret: process.env.ZOOM_SDK_CLIENT_SECRET || "",
    get sdkEnabled() {
      return Boolean(process.env.ZOOM_SDK_CLIENT_ID && process.env.ZOOM_SDK_CLIENT_SECRET);
    },
  },

  company: {
    name: process.env.COMPANY_NAME || "Your Company",
    isListed: (process.env.COMPANY_IS_LISTED || "false").toLowerCase() === "true",
  },
};

// Zoom is a best-effort enhancement (Physical meetings never need it, and
// Video/Hybrid meetings degrade gracefully to a manually-entered link without
// it) — not safety-critical, so this is a warning, not a boot-blocking check.
if (!env.zoom.enabled) {
  console.warn("[env] ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET are not set — Video/Hybrid meetings won't get an automatic Zoom link.");
}
if (!env.zoom.sdkEnabled) {
  console.warn("[env] ZOOM_SDK_CLIENT_ID / ZOOM_SDK_CLIENT_SECRET are not set — the meeting room will link out to Zoom instead of embedding the call.");
}

// Fail fast on an insecure production configuration. Board papers are
// price-sensitive material; booting with placeholder credentials is never
// an acceptable degraded mode.
if (isProd) {
  const problems: string[] = [];

  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is not set.");
  if (!process.env.AUTH_SECRET) problems.push("AUTH_SECRET is not set.");
  else if (INSECURE_SECRETS.has(env.authSecret) || env.authSecret.length < 32) {
    problems.push("AUTH_SECRET is a placeholder or shorter than 32 characters.");
  }
  if (!process.env.APP_URL) problems.push("APP_URL is not set.");
  else if (!env.appUrl.startsWith("https://")) problems.push("APP_URL must use https in production.");

  // Bootstrap credentials are for first-run setup only and must not linger in
  // a deployed environment.
  if (process.env.BOOTSTRAP_ADMIN_PASSWORD) {
    problems.push("BOOTSTRAP_ADMIN_PASSWORD must be removed after the first admin account is created.");
  }
  if (env.notifyDriver === "smtp" && !env.smtp.host) {
    problems.push("NOTIFY_DRIVER=smtp but SMTP_HOST is not set.");
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: insecure production configuration.\n  - ${problems.join("\n  - ")}`,
    );
  }
}
