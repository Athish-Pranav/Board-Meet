import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { loadRoomData } from "@/lib/roomData";
import { MeetingRoom } from "./MeetingRoom";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const id = Number(params.id);
  const { meeting, agenda, pack, voting, embedCall, canStartSession } = await loadRoomData(user, id);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="eyebrow">Meeting room</p>
          <h1 className="font-serif text-2xl font-semibold text-brand-900">{meeting.title}</h1>
        </div>
        <Link href={`/meetings/${id}`} className="btn-secondary btn-sm">← Back to meeting</Link>
      </div>
      <MeetingRoom
        meetingId={id}
        meetingTitle={meeting.title}
        agenda={agenda}
        pack={pack}
        joinUrl={meeting.meetingLink}
        embedCall={embedCall}
        voting={voting}
        canStartSession={canStartSession}
      />
    </div>
  );
}
