import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "Passw0rd!";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // --- Users -------------------------------------------------------------
  const users = [
    { name: "System Administrator", email: "admin@company.in", role: "CompanySecretary", designation: "IT Admin", isDirector: false },
    { name: "Rajesh Mehta", email: "chairman@company.in", role: "Chairman", designation: "Chairman of the Board", isDirector: true },
    { name: "Sunita Rao", email: "secretary@company.in", role: "CompanySecretary", designation: "Company Secretary", isDirector: false },
    { name: "Ananya Iyer", email: "ananya@company.in", role: "BoardMember", designation: "Independent Director", isDirector: true },
    { name: "Rahul Verma", email: "rahul@company.in", role: "BoardMember", designation: "Director", isDirector: true },
    { name: "Priya Nair", email: "priya@company.in", role: "BoardMember", designation: "Independent Director", isDirector: true },
    { name: "Vikram Singh", email: "vikram@company.in", role: "BoardMember", designation: "Director", isDirector: true },
    { name: "Deepak Kulkarni", email: "presenter@company.in", role: "Management", designation: "CFO", isDirector: false },
  ];

  const created: Record<string, number> = {};
  for (const u of users) {
    const rec = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, designation: u.designation, isDirector: u.isDirector, status: "Active" },
      create: { ...u, passwordHash, status: "Active" },
    });
    created[u.email] = rec.id;
  }

  // --- App settings ------------------------------------------------------
  for (const [key, value] of Object.entries({ companyName: "Precot Limited", isListed: "false" })) {
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  // --- Retention policies (minutes permanent — never auto-delete) --------
  const policies = [
    { category: "BoardMinutes", permanent: true, action: "Flag", retainYears: null as number | null },
    { category: "Resolutions", permanent: true, action: "Flag", retainYears: null },
    { category: "Policies", permanent: false, action: "Archive", retainYears: 8 },
    { category: "StatutoryRegisters", permanent: true, action: "Flag", retainYears: null },
    { category: "CommitteePapers", permanent: false, action: "Archive", retainYears: 8 },
    { category: "General", permanent: false, action: "Archive", retainYears: 5 },
  ];
  for (const p of policies) {
    await prisma.retentionPolicy.upsert({
      where: { category: p.category },
      update: { permanent: p.permanent, action: p.action, retainYears: p.retainYears },
      create: p,
    });
  }

  // --- Folders -----------------------------------------------------------
  const folderCats: { name: string; category: string }[] = [
    { name: "Board Minutes", category: "BoardMinutes" },
    { name: "Resolutions", category: "Resolutions" },
    { name: "Policies", category: "Policies" },
    { name: "Statutory Registers", category: "StatutoryRegisters" },
    { name: "Committee Papers", category: "CommitteePapers" },
  ];
  for (const f of folderCats) {
    const exists = await prisma.folder.findFirst({ where: { name: f.name } });
    if (!exists) await prisma.folder.create({ data: f });
  }

  // --- Audit committee ---------------------------------------------------
  let auditCommittee = await prisma.committee.findFirst({ where: { name: "Audit Committee" } });
  if (!auditCommittee) {
    auditCommittee = await prisma.committee.create({
      data: {
        name: "Audit Committee",
        type: "Audit",
        description: "Oversees financial reporting, internal controls and statutory audit.",
        members: {
          create: [
            { userId: created["ananya@company.in"], role: "Chair" },
            { userId: created["priya@company.in"], role: "Member" },
            { userId: created["rahul@company.in"], role: "Member" },
          ],
        },
      },
    });
  }

  const directors = users.filter((u) => u.isDirector).map((u) => created[u.email]);
  const quorum = Math.max(Math.ceil(directors.length / 3), 2);

  // --- A past, concluded board meeting with published minutes ------------
  const existingPast = await prisma.meeting.findFirst({ where: { title: "Q4 FY24-25 Board Meeting" } });
  if (!existingPast) {
    const past = await prisma.meeting.create({
      data: {
        type: "Board",
        title: "Q4 FY24-25 Board Meeting",
        description: "Approval of audited financials and dividend recommendation.",
        scheduledAt: new Date(Date.now() - 75 * 86400000),
        venue: "Registered Office, Mumbai",
        mode: "Hybrid",
        status: "Concluded",
        noticeSentAt: new Date(Date.now() - 90 * 86400000),
        quorumRequired: quorum,
        quorumMet: true,
        startedAt: new Date(Date.now() - 75 * 86400000),
        endedAt: new Date(Date.now() - 75 * 86400000 + 7200000),
        createdById: created["secretary@company.in"],
        agendaItems: {
          create: [
            { sequence: 1, title: "Leave of absence", classification: "ForApproval" },
            { sequence: 2, title: "Confirmation of previous minutes", classification: "ForApproval" },
            { sequence: 3, title: "Audited financial statements FY24-25", classification: "ForApproval", presenterId: created["presenter@company.in"], lockedAt: new Date(), votingStatus: "Passed", majorityRule: "Simple", circulatedAt: new Date(Date.now() - 76 * 86400000), votingClosedAt: new Date(Date.now() - 75 * 86400000) },
            { sequence: 4, title: "Recommendation of final dividend", classification: "ForApproval", lockedAt: new Date(), votingStatus: "Passed", majorityRule: "Simple", circulatedAt: new Date(Date.now() - 76 * 86400000), votingClosedAt: new Date(Date.now() - 75 * 86400000) },
          ],
        },
      },
    });

    for (const d of directors) {
      await prisma.attendance.create({ data: { meetingId: past.id, userId: d, status: "Present", joinedAt: past.startedAt } });
    }

    // The "For Approval" items (resolutions) were carried unanimously.
    const passedItems = await prisma.agendaItem.findMany({ where: { meetingId: past.id, votingStatus: "Passed" } });
    for (const item of passedItems) {
      for (const d of directors) {
        await prisma.vote.create({ data: { agendaItemId: item.id, userId: d, choice: "For" } });
      }
    }

    const minutes = await prisma.minutes.create({
      data: {
        meetingId: past.id,
        status: "Published",
        content:
          "1. The Chairman confirmed quorum was present and called the meeting to order.\n" +
          "2. The minutes of the previous meeting were confirmed.\n" +
          "3. The audited financial statements for FY24-25 were tabled by the CFO and APPROVED.\n" +
          "4. The Board recommended a final dividend of ₹2 per equity share, subject to shareholder approval at the AGM.",
        circulatedAt: new Date(Date.now() - 70 * 86400000),
        approvedAt: new Date(Date.now() - 60 * 86400000),
        finalizedAt: new Date(Date.now() - 60 * 86400000),
        signedById: created["chairman@company.in"],
      },
    });

    await prisma.actionItem.create({
      data: {
        title: "File AOC-4 and MGT-7 with the RoC",
        description: "Statutory annual filings following adoption of accounts.",
        sourceMinutesId: minutes.id,
        meetingId: past.id,
        assigneeId: created["secretary@company.in"],
        dueDate: new Date(Date.now() + 10 * 86400000),
        status: "InProgress",
        createdById: created["secretary@company.in"],
      },
    });
  }

  // --- An upcoming board meeting -----------------------------------------
  const existingNext = await prisma.meeting.findFirst({ where: { title: "Q1 FY25-26 Board Meeting" } });
  if (!existingNext) {
    const next = await prisma.meeting.create({
      data: {
        type: "Board",
        title: "Q1 FY25-26 Board Meeting",
        description: "Quarterly results review and committee re-constitution.",
        scheduledAt: new Date(Date.now() + 12 * 86400000),
        venue: "Registered Office, Mumbai",
        mode: "Hybrid",
        meetingLink: "https://teams.microsoft.com/l/meetup-join/placeholder",
        status: "Scheduled",
        noticeSentAt: new Date(Date.now() + 0),
        quorumRequired: quorum,
        createdById: created["secretary@company.in"],
        agendaItems: {
          create: [
            { sequence: 1, title: "Leave of absence", classification: "ForApproval" },
            { sequence: 2, title: "Confirmation of minutes of the last meeting", classification: "ForApproval" },
            { sequence: 3, title: "Unaudited financial results Q1 FY25-26", classification: "ForApproval", presenterId: created["presenter@company.in"] },
            { sequence: 4, title: "Re-constitution of the Audit Committee", classification: "ForApproval", majorityRule: "Simple", votingStatus: "Circulated", circulatedAt: new Date() },
            { sequence: 5, title: "Any other business with the permission of the Chair", classification: "ForDiscussion" },
          ],
        },
      },
    });
    for (const d of directors) {
      await prisma.attendance.create({ data: { meetingId: next.id, userId: d, status: "Invited" } });
    }
    await prisma.attendance.create({ data: { meetingId: next.id, userId: created["presenter@company.in"], status: "Invited", isPresenter: true } });

    // A resolution (For-Approval item) open for voting — the Chairman has voted, others pending.
    const openItem = await prisma.agendaItem.findFirst({ where: { meetingId: next.id, votingStatus: "Circulated" } });
    if (openItem) {
      await prisma.vote.create({ data: { agendaItemId: openItem.id, userId: created["chairman@company.in"], choice: "For" } });
    }
  }

  // --- Announcements (News / Shared docs) --------------------------------
  const announcements = [
    { title: "Q1 board pack will be published this week", body: "The secretariat is finalising the Q1 FY25-26 board pack. Expect it in your inbox by Thursday.", category: "News", pinned: true },
    { title: "Updated Code of Conduct policy", body: "The revised Code of Conduct has been filed under Policies in the document repository. Please acknowledge.", category: "SharedDoc", pinned: false },
    { title: "Statutory auditor reappointment", body: "The Audit Committee has recommended reappointment of the statutory auditors for FY25-26.", category: "News", pinned: false },
  ];
  for (const a of announcements) {
    const exists = await prisma.announcement.findFirst({ where: { title: a.title } });
    if (!exists) await prisma.announcement.create({ data: { ...a, createdById: created["secretary@company.in"] } });
  }

  console.log("Seed complete.");
  console.log("Login with any of these (password for all: " + PASSWORD + "):");
  console.log("  admin@company.in (Company Secretary) · chairman@company.in (Chairman) · secretary@company.in (Company Secretary)");
  console.log("  ananya@company.in / rahul@company.in / priya@company.in / vikram@company.in (Board Members)");
  console.log("  presenter@company.in (Management)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
