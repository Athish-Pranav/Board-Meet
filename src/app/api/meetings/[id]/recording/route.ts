import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const id = Number(params.id);
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return new Response("Meeting not found", { status: 404 });

  try {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!file || !(file instanceof File)) {
      return new Response("No file uploaded", { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    // Save file to storage
    const stored = await saveFile(bytes, file.name, file.type || "video/webm");

    // Update meeting with the recording key
    await prisma.meeting.update({
      where: { id },
      data: {
        recordingKey: stored.storageKey,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Recording upload API error:", e);
    return new Response(e.message || "Error processing upload", { status: 500 });
  }
}
