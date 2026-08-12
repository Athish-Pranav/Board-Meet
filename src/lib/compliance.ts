// Companies Act 2013 compliance rules, encoded as pure functions so they can be
// reused on server and client. Have your Company Secretary review against the
// current Act + SS-1 text (per spec Section 8) — wording is periodically amended.

import { differenceInCalendarDays } from "date-fns";
import type { VoteChoice } from "./enums";

export const RULES = {
  MIN_NOTICE_DAYS: 7, // s.173(3)
  MAX_GAP_DAYS: 120, // s.173(1) — between consecutive board meetings
  MIN_BOARD_MEETINGS_PER_YEAR: 4, // s.173(1)
  MINUTES_FINALIZE_DAYS: 30, // s.118
  SPECIAL_MAJORITY: 0.75,
};

/** s.174: quorum = higher of one-third of total directors or two directors. */
export function quorumRequired(totalDirectors: number): number {
  if (totalDirectors <= 0) return 0;
  return Math.max(Math.ceil(totalDirectors / 3), 2);
}

export function quorumMet(presentDirectors: number, totalDirectors: number): boolean {
  const required = quorumRequired(totalDirectors);
  return required > 0 && presentDirectors >= required;
}

/** Days of notice actually given (notice sent → meeting date). */
export function noticeDays(noticeSentAt: Date | null, scheduledAt: Date): number | null {
  if (!noticeSentAt) return null;
  return differenceInCalendarDays(scheduledAt, noticeSentAt);
}

export function noticeIsSufficient(
  noticeSentAt: Date | null,
  scheduledAt: Date,
  shortNoticeConsent: boolean,
): boolean {
  const days = noticeDays(noticeSentAt, scheduledAt);
  if (days === null) return false;
  return days >= RULES.MIN_NOTICE_DAYS || shortNoticeConsent;
}

/** Gap (days) between two consecutive board meetings. */
export function gapDays(previous: Date, next: Date): number {
  return differenceInCalendarDays(next, previous);
}

export function gapBreached(previous: Date, next: Date): boolean {
  return gapDays(previous, next) > RULES.MAX_GAP_DAYS;
}

/** s.118: minutes must be entered/finalized within 30 days of the meeting. */
export function minutesDeadline(meetingDate: Date): Date {
  const d = new Date(meetingDate);
  d.setDate(d.getDate() + RULES.MINUTES_FINALIZE_DAYS);
  return d;
}

export function minutesOverdue(meetingDate: Date, finalizedAt: Date | null, now = new Date()): boolean {
  const deadline = minutesDeadline(meetingDate);
  if (finalizedAt) return finalizedAt > deadline;
  return now > deadline;
}

export function minutesDaysRemaining(meetingDate: Date, now = new Date()): number {
  return differenceInCalendarDays(minutesDeadline(meetingDate), now);
}

// --- Resolution tallying ---------------------------------------------------

export type Tally = {
  for: number;
  against: number;
  abstain: number;
  cast: number; // for + against (abstentions excluded from majority base)
  passed: boolean;
  thresholdLabel: string;
};

export function tallyVotes(choices: VoteChoice[], rule: "Simple" | "Special"): Tally {
  const forN = choices.filter((c) => c === "For").length;
  const againstN = choices.filter((c) => c === "Against").length;
  const abstainN = choices.filter((c) => c === "Abstain").length;
  const cast = forN + againstN;
  let passed = false;
  if (rule === "Special") {
    passed = cast > 0 && forN / cast >= RULES.SPECIAL_MAJORITY;
  } else {
    passed = forN > againstN;
  }
  return {
    for: forN,
    against: againstN,
    abstain: abstainN,
    cast,
    passed,
    thresholdLabel: rule === "Special" ? "≥ 75% of votes cast" : "Simple majority",
  };
}

// --- Severity helper for UI badges -----------------------------------------

export type Severity = "ok" | "warn" | "breach";

export function noticeSeverity(
  noticeSentAt: Date | null,
  scheduledAt: Date,
  shortNoticeConsent: boolean,
): Severity {
  const days = noticeDays(noticeSentAt, scheduledAt);
  if (days === null) return "warn"; // notice not recorded yet
  if (days >= RULES.MIN_NOTICE_DAYS) return "ok";
  return shortNoticeConsent ? "warn" : "breach";
}
