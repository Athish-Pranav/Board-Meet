// Central registry of string-backed "enums" (SQL Server has no DB enums) plus
// human labels. Validate against these everywhere a value is written.

export const ROLES = ["Chairman", "CompanySecretary", "BoardMember", "Management", "CFO", "ManagingDirector"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  Chairman: "Chairman",
  CompanySecretary: "Company Secretary",
  BoardMember: "Board Member",
  Management: "Invitee",
  CFO: "CFO",
  ManagingDirector: "Managing Director",
};

export const USER_STATUS = ["Active", "Suspended", "Inactive"] as const;

export const MEETING_TYPES = ["Board", "Committee"] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];
export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  Board: "Board Meeting",
  Committee: "Committee Meeting",

};

export const MEETING_MODES = ["Physical", "Video", "Hybrid"] as const;

export const MEETING_STATUS = ["Draft", "Scheduled", "InSession", "Concluded", "Cancelled"] as const;
export type MeetingStatus = (typeof MEETING_STATUS)[number];
export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  Draft: "Draft",
  Scheduled: "Scheduled",
  InSession: "In Session",
  Concluded: "Concluded",
  Cancelled: "Cancelled",
};

export const COMMITTEE_TYPES = ["Audit", "Risk", "Nomination", "CSR", "Stakeholders", "Other"] as const;

export const AGENDA_CLASSIFICATIONS = ["ForApproval", "ForInformation", "ForDiscussion"] as const;
export type AgendaClassification = (typeof AGENDA_CLASSIFICATIONS)[number];
export const AGENDA_CLASSIFICATION_LABELS: Record<AgendaClassification, string> = {
  ForApproval: "For Approval",
  ForInformation: "For Information",
  ForDiscussion: "For Discussion",
};

export const DOC_CLASSIFICATIONS = ["Confidential", "Restricted", "Internal"] as const;
export type DocClassification = (typeof DOC_CLASSIFICATIONS)[number];

export const FOLDER_CATEGORIES = [
  "BoardMinutes",
  "Resolutions",
  "Policies",
  "StatutoryRegisters",
  "CommitteePapers",
  "General",
] as const;
export type FolderCategory = (typeof FOLDER_CATEGORIES)[number];
export const FOLDER_CATEGORY_LABELS: Record<FolderCategory, string> = {
  BoardMinutes: "Board Minutes",
  Resolutions: "Resolutions",
  Policies: "Policies",
  StatutoryRegisters: "Statutory Registers",
  CommitteePapers: "Committee Papers",
  General: "General",
};

export const ATTENDANCE_STATUS = [
  "Invited",
  "Present",
  "PresentViaVideo",
  "LeaveOfAbsence",
  "Absent",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  Invited: "Invited",
  Present: "Present",
  PresentViaVideo: "Present via Video",
  LeaveOfAbsence: "Leave of Absence",
  Absent: "Absent",
};
// Statuses that count toward quorum (s.174). Leave of absence / absent do not.
export const ATTENDANCE_PRESENT_STATES: AttendanceStatus[] = ["Present", "PresentViaVideo"];

export const MINUTES_STATUS = ["Draft", "Circulated", "Approved", "Published"] as const;
export type MinutesStatus = (typeof MINUTES_STATUS)[number];

export const ACTION_STATUS = ["Open", "InProgress", "Done", "Overdue"] as const;
export type ActionStatus = (typeof ACTION_STATUS)[number];
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  Open: "Open",
  InProgress: "In Progress",
  Done: "Done",
  Overdue: "Overdue",
};

export const MAJORITY_RULES = ["Simple", "Special"] as const;
export type MajorityRule = (typeof MAJORITY_RULES)[number];

// Voting lifecycle for a "For Approval" agenda item (the resolution put to the board).
export const AGENDA_VOTING_STATUS = ["None", "Circulated", "Passed", "Failed", "Withdrawn"] as const;
export type AgendaVotingStatus = (typeof AGENDA_VOTING_STATUS)[number];
export const AGENDA_VOTING_STATUS_LABELS: Record<AgendaVotingStatus, string> = {
  None: "Not circulated",
  Circulated: "Voting open",
  Passed: "Passed",
  Failed: "Failed",
  Withdrawn: "Withdrawn",
};

export const VOTE_CHOICES = ["For", "Against", "Abstain"] as const;
export type VoteChoice = (typeof VOTE_CHOICES)[number];

export const NOTIFICATION_TYPES = [
  "MeetingInvite",
  "BoardPackPublished",
  "ActionDue",
  "MinutesCirculated",
  "ResolutionCirculated",
  "Escalation",
  "PaperAlert",
  "Reschedule",
  "News",
] as const;

export const ANNOUNCEMENT_CATEGORIES = ["News", "SharedDoc"] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];
export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  News: "News",
  SharedDoc: "Shared Document",
};

export function isOneOf<T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}
