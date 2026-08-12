import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { env } from "@/lib/env";
import { loadRoomData } from "@/lib/roomData";
import { ZoomClientView } from "@/components/call/ZoomClientView";
import { CallSidePanel } from "@/components/call/CallSidePanel";
import { CallVotePrompt } from "@/components/call/CallVotePrompt";

export const dynamic = "force-dynamic";

/**
 * The actual video call — Zoom's full Client View, taking over this whole
 * page, with the meeting's papers available in a collapsible side panel (see
 * CallSidePanel) rather than a box embedded in the page's normal layout flow.
 *
 * Deliberately OUTSIDE the (app) route group, not just its own route within
 * it: (app)/layout.tsx mounts several fixed-position, high-z-index overlays
 * (ChatWidget, CommandPalette, LiveVoteNotifier, LiveMeetingNotifier) that
 * sat over Zoom's own injected UI and silently ate every click — Zoom's video
 * showed through visually while nothing was actually clickable. This route
 * tree has none of that chrome, only the root layout (fonts + <html>/<body>,
 * nothing interactive) plus the one side panel this page adds itself.
 *
 * Leaving the call navigates to `leaveUrl` (below) — a real page transition
 * back into the room, not something toggled inside a persistent app shell.
 */
export default async function CallPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const id = Number(params.id);
  const { agenda, pack, voting, canVote, embedCall } = await loadRoomData(user, id);

  // Nothing to join — send back to the room, which shows the right fallback
  // (plain "Open in Zoom" link, or nothing for a Physical meeting).
  if (!embedCall) redirect(`/meetings/${id}/room`);

  return (
    <>
      <ZoomClientView meetingId={id} leaveUrl={`${env.appUrl}/meetings/${id}/room`} />
      <CallSidePanel meetingId={id} agenda={agenda} pack={pack} voting={voting} />
      {/* Directors get no Voting tab in CallSidePanel (Secretary/CFO-only, see
          RoomTabs) — this is their only way to vote from inside the call. */}
      {canVote && !voting ? <CallVotePrompt meetingId={id} /> : null}
    </>
  );
}
