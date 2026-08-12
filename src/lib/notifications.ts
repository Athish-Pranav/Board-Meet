import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "./db";
import { env } from "./env";

type NotifyInput = {
  userId: number;
  type: string;
  subject: string;
  body: string;
  channel?: "InApp" | "Email";
  relatedEntityType?: string;
  relatedEntityId?: number;
};

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465, // Gmail/Outlook: 587 = STARTTLS, 465 = TLS
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/** Sends one email via the configured SMTP account (Gmail/Outlook/etc). */
async function sendMail(to: string, subject: string, body: string): Promise<void> {
  await getTransporter().sendMail({
    from: env.smtp.from,
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, "<br/>"),
  });
}

/**
 * Records a notification and "delivers" it via the configured driver.
 *  - InApp: appears in the bell menu (status Sent immediately).
 *  - Email + NOTIFY_DRIVER=smtp (with SMTP_HOST set): sent for real via nodemailer
 *    to the user's registered email (Gmail, Outlook, or any SMTP account).
 *  - Email + NOTIFY_DRIVER=log (default, no SMTP configured): logged to console
 *    + stored, so nothing is silently lost while SMTP isn't set up yet.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const channel = input.channel ?? "InApp";
  let status: "Sent" | "Pending" | "Failed" = "Sent";
  let sentAt: Date | null = new Date();

  if (channel === "Email") {
    if (env.notifyDriver === "smtp" && env.smtp.host) {
      const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
      if (!user) {
        status = "Failed";
        sentAt = null;
      } else {
        try {
          await sendMail(user.email, input.subject, input.body);
        } catch (err) {
          status = "Failed";
          sentAt = null;
          console.error(`[notify] SMTP send failed for user ${input.userId} <${user.email}>:`, err);
        }
      }
    } else {
      console.info(`[notify:email] -> user#${input.userId} | ${input.subject}\n${input.body}`);
    }
  }

  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      channel,
      subject: input.subject,
      body: input.body,
      status,
      sentAt,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
    },
  });
}

export async function notifyMany(userIds: number[], input: Omit<NotifyInput, "userId">): Promise<void> {
  await Promise.all([...new Set(userIds)].map((userId) => notify({ ...input, userId })));
}

export async function sendNoticeEmail({
  to,
  cc,
  bcc,
  subject,
  body,
  attachments,
}: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  if (env.notifyDriver === "smtp" && env.smtp.host) {
    await getTransporter().sendMail({
      from: env.smtp.from,
      to: to.join(", "),
      cc: cc && cc.length > 0 ? cc.join(", ") : undefined,
      bcc: bcc && bcc.length > 0 ? bcc.join(", ") : undefined,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br/>"),
      attachments,
    });
  } else {
    console.info(`[sendNoticeEmail:log]
      From: ${env.smtp.from}
      To: ${to.join(", ")}
      CC: ${cc?.join(", ")}
      BCC: ${bcc?.join(", ")}
      Subject: ${subject}
      Body: ${body}
      Attachments: ${attachments?.map((a) => a.filename).join(", ") || "none"}
    `);
  }
}
