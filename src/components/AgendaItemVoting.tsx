"use client";

import { useEffect, useState, useTransition } from "react";
import { VOTE_CHOICES, type VoteChoice, AGENDA_VOTING_STATUS_LABELS, type AgendaVotingStatus } from "@/lib/enums";
import { Badge } from "./ui";
import { useToast } from "./Toast";
import { castVote, circulateForVote, closeVote, withdrawVote } from "@/app/(app)/meetings/[id]/agenda/actions";
import { tallyVotes } from "@/lib/compliance";

type Vote = {
  id: number;
  agendaItemId: number;
  userId: number;
  choice: string;
  previousChoice: string | null;
  votedAt: Date;
  user: {
    name: string;
  };
};

type Props = {
  meetingId: number;
  itemId: number;
  initialVotes: Vote[];
  userId: number;
  userName: string;
  majorityRule: string;
  initialVotingStatus: string;
  totalVoters: number;
  canVote: boolean;
  canManageVote: boolean;
  // When true, poll for status even while "None" so participants see a vote the
  // moment it's opened (used inside the live meeting room).
  alwaysPoll?: boolean;
};

export function AgendaItemVoting({
  meetingId,
  itemId,
  initialVotes,
  userId,
  userName,
  majorityRule,
  initialVotingStatus,
  totalVoters,
  canVote,
  canManageVote,
  alwaysPoll = false,
}: Props) {
  const toast = useToast();
  const [votes, setVotes] = useState<Vote[]>(initialVotes);
  const [status, setStatus] = useState<string>(initialVotingStatus);
  const [busyChoice, setBusyChoice] = useState<string | null>(null);
  const [isAdminPending, startAdminTransition] = useTransition();
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  useEffect(() => {
    setVotes(initialVotes);
  }, [initialVotes]);

  useEffect(() => {
    setStatus(initialVotingStatus);
  }, [initialVotingStatus]);

  useEffect(() => {
    // Poll while the vote is open; in the room also poll while still "None" so a
    // freshly-opened vote surfaces to everyone without a reload.
    const decided = status === "Passed" || status === "Failed" || status === "Withdrawn";
    if (decided || (status !== "Circulated" && !alwaysPoll)) return;

    let active = true;
    const fetchLatest = async () => {
      try {
        const res = await fetch(`/api/votes/${itemId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (active && busyChoice === null) {
          setVotes(data.votes);
          setStatus(data.votingStatus);
        }
      } catch {
        // Silent catch for network issues
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(fetchLatest, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [itemId, status, busyChoice, alwaysPoll]);

  const handleVote = async (choice: string) => {
    const prevVotes = [...votes];
    const existingIdx = votes.findIndex((v) => v.userId === userId);
    let newVotes = [...votes];
    const newVoteRecord: Vote = {
      id: existingIdx >= 0 ? votes[existingIdx].id : -Math.random(),
      agendaItemId: itemId,
      userId,
      choice,
      previousChoice: existingIdx >= 0 ? votes[existingIdx].choice : null,
      votedAt: new Date(),
      user: { name: userName },
    };

    if (existingIdx >= 0) {
      newVotes[existingIdx] = newVoteRecord;
    } else {
      newVotes.push(newVoteRecord);
    }

    // Optimistically update votes list and button state
    setVotes(newVotes);
    setBusyChoice(choice);

    const fd = new FormData();
    fd.set("meetingId", String(meetingId));
    fd.set("itemId", String(itemId));
    fd.set("choice", choice);

    try {
      const res = await castVote({}, fd);
      setBusyChoice(null);
      if (res?.error) {
        setVotes(prevVotes);
        toast({ type: "error", message: res.error });
      } else {
        toast({ type: "success", message: `Voted ${choice}` });
      }
    } catch {
      setVotes(prevVotes);
      setBusyChoice(null);
      toast({ type: "error", message: "Failed to submit vote." });
    }
  };

  const handleCirculate = () => {
    const prevStatus = status;
    setStatus("Circulated");

    startAdminTransition(async () => {
      const fd = new FormData();
      fd.set("meetingId", String(meetingId));
      fd.set("itemId", String(itemId));
      const res = await circulateForVote({}, fd);
      if (res?.error) {
        setStatus(prevStatus);
        toast({ type: "error", message: res.error });
      } else {
        toast({ type: "success", message: "Circulated for voting" });
      }
    });
  };

  const handleClose = () => {
    const tally = tallyVotes(votes.map((v) => v.choice as VoteChoice), majorityRule as "Simple" | "Special");
    const nextStatus = tally.passed ? "Passed" : "Failed";
    const prevStatus = status;
    setStatus(nextStatus);

    startAdminTransition(async () => {
      const fd = new FormData();
      fd.set("meetingId", String(meetingId));
      fd.set("itemId", String(itemId));
      const res = await closeVote({}, fd);
      if (res?.error) {
        setStatus(prevStatus);
        toast({ type: "error", message: res.error });
      } else {
        toast({ type: "success", message: "Result recorded" });
      }
    });
  };

  const handleWithdraw = () => {
    const prevStatus = status;
    setStatus("Withdrawn");
    setConfirmingWithdraw(false);

    startAdminTransition(async () => {
      const fd = new FormData();
      fd.set("meetingId", String(meetingId));
      fd.set("itemId", String(itemId));
      const res = await withdrawVote({}, fd);
      if (res?.error) {
        setStatus(prevStatus);
        toast({ type: "error", message: res.error });
      } else {
        toast({ type: "success", message: "Resolution withdrawn" });
      }
    });
  };

  const tally = tallyVotes(votes.map((v) => v.choice as VoteChoice), majorityRule as "Simple" | "Special");
  const myVote = votes.find((v) => v.userId === userId);
  const open = status === "Circulated";
  const decided = status === "Passed" || status === "Failed";

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Voting &amp; approval</p>
        <Badge tone={status === "Passed" ? "green" : status === "Failed" ? "red" : status === "Circulated" ? "amber" : "gray"}>
          {AGENDA_VOTING_STATUS_LABELS[status as AgendaVotingStatus]}
        </Badge>
      </div>

      {status !== "None" ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span>For <strong className="text-emerald-600">{tally.for}</strong></span>
          <span>Against <strong className="text-red-600">{tally.against}</strong></span>
          <span>Abstain <strong className="text-slate-500">{tally.abstain}</strong></span>
          <span className="text-slate-300">·</span>
          <span>{tally.cast} of {totalVoters} voters</span>
          <span className="text-xs text-slate-400">({tally.thresholdLabel})</span>
          {!decided ? (
            <Badge tone={tally.passed ? "green" : "amber"}>{tally.passed ? "Currently passing" : "Not yet passing"}</Badge>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">
          Not yet circulated for voting · Majority: {majorityRule === "Special" ? "Special (≥75%)" : "Simple"}
        </p>
      )}

      {canVote && open ? (
        <div className="mt-3">
          {myVote ? (
            <p className="mb-1 text-xs text-slate-500">
              Your vote: <Badge tone="blue">{myVote.choice}</Badge> — you can change it until voting closes.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {VOTE_CHOICES.map((c) => (
              <button
                key={c}
                disabled={busyChoice !== null}
                onClick={() => handleVote(c)}
                className={c === "For" ? "btn-primary btn-sm" : c === "Against" ? "btn-danger btn-sm" : "btn-secondary btn-sm"}
              >
                {busyChoice === c ? "Voting..." : c}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {votes.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {votes.map((v) => (
            <li key={v.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-600">
                {v.user.name}
                {v.previousChoice ? <span className="ml-1 text-slate-400">(changed from {v.previousChoice})</span> : null}
              </span>
              <Badge tone={v.choice === "For" ? "green" : v.choice === "Against" ? "red" : "gray"}>{v.choice}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {canManageVote ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {status === "None" ? (
            <button disabled={isAdminPending} onClick={handleCirculate} className="btn-secondary btn-sm">
              {isAdminPending ? "Circulating..." : "Circulate for voting"}
            </button>
          ) : null}
          {open ? (
            <>
              <button disabled={isAdminPending} onClick={handleClose} className="btn-primary btn-sm">
                {isAdminPending ? "Closing..." : "Close & record result"}
              </button>
              {confirmingWithdraw ? (
                <span className="inline-flex items-center gap-1">
                  <button disabled={isAdminPending} onClick={handleWithdraw} className="btn-danger btn-sm">
                    {isAdminPending ? "Withdrawing..." : "Yes, withdraw"}
                  </button>
                  <button type="button" onClick={() => setConfirmingWithdraw(false)} className="btn-secondary btn-sm">
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmingWithdraw(true)} className="btn-danger btn-sm">
                  Withdraw
                </button>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
