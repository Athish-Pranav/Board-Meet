import { prisma } from "@/lib/db";
import { readFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const id = Number(params.id);
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting || !meeting.recordingKey) {
    return new Response("Recording not found", { status: 404 });
  }

  try {
    const bytes = await readFile(meeting.recordingKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "video/webm",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename="meeting-${id}-recording.webm"`,
      },
    });
  } catch (e: any) {
    console.error("Recording stream API error:", e);
    return new Response(e.message || "Error reading file", { status: 500 });
  }
}
