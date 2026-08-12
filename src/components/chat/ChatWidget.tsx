"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from "react";
import { initials, cn, fmtBytes } from "@/lib/format";
import { DocViewer } from "./DocViewer";

type Me = { id: number; name: string; role: string };
type Member = { id: number; name: string; role: string };
type LastMsg = { body: string | null; attachmentName: string | null; senderName: string; senderId: number; at: string } | null;
type Convo = { id: number; type: "Direct" | "Group"; name: string; memberCount: number; members: Member[]; lastMessage: LastMsg; unread: number; updatedAt: string };
type Msg = { id: number; senderId: number; senderName: string; body: string | null; attachment: { name: string; type: string; size: number } | null; at: string };
type Receipt = { userId: number; lastReadAt: string | null };
type UserLite = { id: number; name: string; roleLabel: string; designation: string | null };

const TICK_LIST = 7000;
const TICK_MSGS = 3000;

export function ChatWidget({ me, canCreateGroup }: { me: Me; canCreateGroup: boolean }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "convo" | "new" | "newgroup">("list");
  const [conversations, setConversations] = useState<Convo[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [active, setActive] = useState<Convo | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupSel, setGroupSel] = useState<Set<number>>(new Set());
  const [viewing, setViewing] = useState<{ messageId: number; name: string; type: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const lastIdRef = useRef(0);

  // --- Draggable bubble -----------------------------------------------------
  const SIZE = 56;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  posRef.current = pos;
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const clampPos = (p: { x: number; y: number }) => ({
    x: Math.max(8, Math.min(p.x, window.innerWidth - SIZE - 8)),
    y: Math.max(8, Math.min(p.y, window.innerHeight - SIZE - 8)),
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("chatBubblePos");
      if (saved) { setPos(clampPos(JSON.parse(saved))); return; }
    } catch { /* ignore */ }
    setPos({ x: window.innerWidth - SIZE - 24, y: window.innerHeight - SIZE - 24 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampPos(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onBubbleDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const cur = posRef.current ?? { x: window.innerWidth - SIZE - 24, y: window.innerHeight - SIZE - 24 };
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y, moved: false };
  };
  const onBubbleMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setPos(clampPos({ x: d.ox + dx, y: d.oy + dy }));
  };
  const onBubbleUp = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!d.moved) {
      // a tap (not a drag) toggles the chat
      setOpen((v) => { const nv = !v; if (nv) { setView("list"); refreshConversations(); } return nv; });
    } else if (posRef.current) {
      try { localStorage.setItem("chatBubblePos", JSON.stringify(posRef.current)); } catch { /* ignore */ }
    }
    dragRef.current = null;
  };

  // Anchor the popup near the bubble, kept on-screen.
  const panelStyle = (): CSSProperties => {
    if (!pos || typeof window === "undefined") return { bottom: 96, right: 24, width: 380 };
    const W = Math.min(380, window.innerWidth - 16);
    const H = Math.min(560, Math.round(window.innerHeight * 0.78));
    const left = Math.max(8, Math.min(pos.x + SIZE - W, window.innerWidth - W - 8));
    const openAbove = pos.y + SIZE / 2 > window.innerHeight / 2;
    const top = Math.max(8, Math.min(openAbove ? pos.y - 12 - H : pos.y + SIZE + 12, window.innerHeight - H - 8));
    return { left, top, width: W };
  };

  const refreshConversations = useCallback(async () => {
    try {
      const r = await fetch("/api/chat/conversations", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setConversations(d.conversations);
      setUnreadTotal(d.unreadTotal);
    } catch { /* ignore */ }
  }, []);

  const loadUsers = useCallback(async (q: string) => {
    try {
      const r = await fetch(`/api/chat/users?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (r.ok) setUsers((await r.json()).users);
    } catch { /* ignore */ }
  }, []);

  const openConvo = useCallback(async (c: Convo) => {
    setActive(c);
    setView("convo");
    setMessages([]);
    setReceipts([]);
    lastIdRef.current = 0;
    const r = await fetch(`/api/chat/conversations/${c.id}/messages`, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setMessages(d.messages);
      setReceipts(d.receipts ?? []);
      lastIdRef.current = d.messages.length ? d.messages[d.messages.length - 1].id : 0;
    }
    fetch(`/api/chat/conversations/${c.id}/read`, { method: "POST" }).then(refreshConversations).catch(() => {});
  }, [refreshConversations]);

  // Poll conversation list (for the unread badge) whenever mounted.
  useEffect(() => {
    refreshConversations();
    const t = setInterval(refreshConversations, TICK_LIST);
    return () => clearInterval(t);
  }, [refreshConversations]);

  // Poll messages for the open conversation.
  useEffect(() => {
    if (view !== "convo" || !active) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/chat/conversations/${active.id}/messages?after=${lastIdRef.current}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setReceipts(d.receipts ?? []);
      if (d.messages.length) {
        setMessages((m) => [...m, ...d.messages]);
        lastIdRef.current = d.messages[d.messages.length - 1].id;
        fetch(`/api/chat/conversations/${active.id}/read`, { method: "POST" }).then(refreshConversations).catch(() => {});
      }
    }, TICK_MSGS);
    return () => clearInterval(t);
  }, [view, active, refreshConversations]);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, view]);

  // Click outside the panel (and bubble) closes the chat — but not while a
  // document preview is open.
  useEffect(() => {
    if (!open || viewing) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || bubbleRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, viewing]);

  const send = async () => {
    if (!active || sending) return;
    const file = fileRef.current?.files?.[0];
    if (!text.trim() && !file) return;
    setSending(true);
    const fd = new FormData();
    fd.set("body", text);
    if (file) fd.set("file", file);
    try {
      const r = await fetch(`/api/chat/conversations/${active.id}/messages`, { method: "POST", body: fd });
      if (r.ok) {
        const d = await r.json();
        setMessages((m) => [...m, d.message]);
        lastIdRef.current = d.message.id;
        setText("");
        if (fileRef.current) fileRef.current.value = "";
        refreshConversations();
      }
    } finally {
      setSending(false);
    }
  };

  const startDirect = async (userId: number) => {
    const r = await fetch("/api/chat/direct", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
    if (r.ok) {
      const { id } = await r.json();
      await refreshConversations();
      const r2 = await fetch("/api/chat/conversations", { cache: "no-store" });
      const list: Convo[] = (await r2.json()).conversations;
      const c = list.find((x) => x.id === id);
      if (c) openConvo(c);
    }
  };

  const createGroup = async () => {
    if (groupName.trim().length < 2 || groupSel.size === 0) return;
    const r = await fetch("/api/chat/groups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: groupName.trim(), memberIds: [...groupSel] }) });
    if (r.ok) {
      const { id } = await r.json();
      setGroupName(""); setGroupSel(new Set());
      await refreshConversations();
      const list: Convo[] = (await (await fetch("/api/chat/conversations", { cache: "no-store" })).json()).conversations;
      const c = list.find((x) => x.id === id);
      if (c) openConvo(c);
    } else {
      alert((await r.json()).error ?? "Could not create group");
    }
  };

  return (
    <>
      {/* Floating bubble */}
      <button
        ref={bubbleRef}
        onPointerDown={onBubbleDown}
        onPointerMove={onBubbleMove}
        onPointerUp={onBubbleUp}
        style={pos ? { left: pos.x, top: pos.y, touchAction: "none" } : { touchAction: "none" }}
        className={cn(
          "fixed z-[58] flex h-14 w-14 cursor-grab touch-none items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-pop active:cursor-grabbing",
          !pos && "bottom-6 right-6",
        )}
        aria-label="Messages"
        title="Messages — drag to move"
      >
        {open ? <Glyph name="close" className="h-6 w-6" /> : <Glyph name="chat" className="h-6 w-6" />}
        {!open && unreadTotal > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold ring-2 ring-white">{unreadTotal > 9 ? "9+" : unreadTotal}</span>
        ) : null}
      </button>

      {open ? (
        <div ref={panelRef} style={panelStyle()} className="animate-scale-in fixed z-[58] flex h-[560px] max-h-[78vh] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-pop backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center gap-2 bg-gradient-to-br from-brand-700 to-brand-900 px-4 py-3 text-cream-50">
            {view !== "list" ? <button onClick={() => setView("list")} className="rounded-lg p-1 hover:bg-white/10"><Glyph name="back" /></button> : null}
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-[15px] font-semibold">
                {view === "list" ? "Messages" : view === "new" ? "New chat" : view === "newgroup" ? "New group" : active?.name}
              </p>
              {view === "convo" && active?.type === "Group" ? <p className="truncate text-[11px] text-cream-200">{active.members.map((m) => m.name.split(" ")[0]).join(", ")}</p> : null}
            </div>
            {view === "list" ? (
              <div className="flex items-center gap-1">
                <button onClick={() => { setView("new"); loadUsers(""); }} title="New chat" className="rounded-lg p-1.5 hover:bg-white/10"><Glyph name="newchat" /></button>
                {canCreateGroup ? <button onClick={() => { setView("newgroup"); loadUsers(""); }} title="New group" className="rounded-lg p-1.5 hover:bg-white/10"><Glyph name="group" /></button> : null}
              </div>
            ) : null}
          </div>

          {/* Body */}
          {view === "list" ? (
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-400">
                  <Glyph name="chat" className="h-8 w-8 text-slate-300" />
                  No conversations yet. Start one with the + button.
                </div>
              ) : (
                <ul className="divide-y divide-cream-200">
                  {conversations.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => openConvo(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-cream-100">
                        <Avatar name={c.name} group={c.type === "Group"} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-brand-900">{c.name}</span>
                            {c.lastMessage ? <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(c.lastMessage.at)}</span> : null}
                          </span>
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-slate-500">
                              {c.lastMessage ? `${c.lastMessage.senderId === me.id ? "You: " : ""}${c.lastMessage.body ?? (c.lastMessage.attachmentName ? "📎 " + c.lastMessage.attachmentName : "")}` : (c.type === "Group" ? `${c.memberCount} members` : "Say hello")}
                            </span>
                            {c.unread > 0 ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">{c.unread}</span> : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {view === "new" ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="p-2">
                <input value={userQuery} onChange={(e) => { setUserQuery(e.target.value); loadUsers(e.target.value); }} placeholder="Search people…" className="input" />
              </div>
              <ul className="flex-1 divide-y divide-cream-200 overflow-y-auto">
                {users.map((u) => (
                  <li key={u.id}>
                    <button onClick={() => startDirect(u.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-cream-100">
                      <Avatar name={u.name} />
                      <span className="min-w-0"><span className="block truncate text-sm font-medium text-brand-900">{u.name}</span><span className="block truncate text-xs text-slate-400">{u.roleLabel}{u.designation ? ` · ${u.designation}` : ""}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {view === "newgroup" ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="space-y-2 p-2">
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" className="input" />
                <input value={userQuery} onChange={(e) => { setUserQuery(e.target.value); loadUsers(e.target.value); }} placeholder="Add members…" className="input" />
              </div>
              <ul className="flex-1 divide-y divide-cream-200 overflow-y-auto">
                {users.map((u) => {
                  const sel = groupSel.has(u.id);
                  return (
                    <li key={u.id}>
                      <button onClick={() => setGroupSel((s) => { const n = new Set(s); n.has(u.id) ? n.delete(u.id) : n.add(u.id); return n; })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-cream-100">
                        <Avatar name={u.name} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-900">{u.name}</span>
                        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border", sel ? "border-emerald-500 bg-emerald-500 text-white" : "border-cream-300")}>{sel ? "✓" : ""}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-cream-200 p-2">
                <button onClick={createGroup} disabled={groupName.trim().length < 2 || groupSel.size === 0} className="btn-primary w-full justify-center disabled:opacity-50">Create group ({groupSel.size})</button>
              </div>
            </div>
          ) : null}

          {view === "convo" && active ? (
            <>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-cream-100/60 p-3">
                {messages.map((m) => {
                  const mine = m.senderId === me.id;
                  const seen = mine && receipts.length > 0 && receipts.every((r) => r.lastReadAt && new Date(r.lastReadAt) >= new Date(m.at));
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm", mine ? "rounded-br-sm bg-brand-600 text-cream-50" : "rounded-bl-sm bg-white text-slate-700")}>
                        {!mine && active.type === "Group" ? <p className="mb-0.5 text-[11px] font-semibold text-gold-600">{m.senderName}</p> : null}
                        {m.attachment ? <Attachment messageId={m.id} att={m.attachment} mine={mine} onView={() => setViewing({ messageId: m.id, name: m.attachment!.name, type: m.attachment!.type })} /> : null}
                        {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
                        <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine ? "text-cream-200" : "text-slate-400")}>
                          {timeAgo(m.at)}
                          {mine ? <SeenTick seen={seen} /> : null}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {messages.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">No messages yet. Say hello 👋</p> : null}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 border-t border-cream-200 bg-white p-2">
                <button type="button" onClick={() => fileRef.current?.click()} title="Attach a document" className="rounded-lg p-2 text-slate-500 hover:bg-cream-100"><Glyph name="clip" /></button>
                <input ref={fileRef} type="file" className="hidden" onChange={() => { if (fileRef.current?.files?.[0]) send(); }} />
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" className="flex-1 rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm focus:border-gold-400 focus:outline-none" />
                <button type="submit" disabled={sending} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"><Glyph name="send" className="h-4 w-4" /></button>
              </form>
            </>
          ) : null}
        </div>
      ) : null}

      {viewing ? <DocViewer url={`/api/chat/attachments/${viewing.messageId}`} name={viewing.name} type={viewing.type} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

function Attachment({ messageId, att, mine, onView }: { messageId: number; att: { name: string; type: string; size: number }; mine: boolean; onView: () => void }) {
  const url = `/api/chat/attachments/${messageId}`;
  const isImg = (att.type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.name);
  if (isImg) {
    // eslint-disable-next-line @next/next/no-img-element
    return <button type="button" onClick={onView} className="mb-1 block"><img src={url} alt={att.name} className="max-h-44 rounded-lg" /></button>;
  }
  return (
    <button type="button" onClick={onView} className={cn("mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition", mine ? "bg-white/15 hover:bg-white/25" : "bg-cream-100 hover:bg-cream-200")}>
      <Glyph name="file" className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{att.name}</span><span className="block text-[10px] opacity-70">{fmtBytes(att.size)} · tap to view</span></span>
    </button>
  );
}

function Avatar({ name, group }: { name: string; group?: boolean }) {
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white", group ? "bg-gradient-to-br from-gold-400 to-gold-600" : "bg-gradient-to-br from-brand-500 to-brand-700")}>
      {group ? <Glyph name="group" className="h-5 w-5" /> : initials(name)}
    </span>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function SeenTick({ seen }: { seen: boolean }) {
  return (
    <svg viewBox="0 0 16 11" width="14" height="10" fill="none" className="shrink-0">
      <path d="M1 5.5 4.5 9 11 1" stroke={seen ? "#34d3ff" : "currentColor"} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 5.5 8.5 9 15 1" stroke={seen ? "#34d3ff" : "currentColor"} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Glyph({ name, className }: { name: string; className?: string }) {
  const c = className ?? "h-5 w-5";
  const p: Record<string, React.ReactNode> = {
    chat: <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    back: <path d="M15 18l-6-6 6-6" />,
    send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />,
    clip: <path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10.5 17a2 2 0 0 1-3-3l7-7" />,
    newchat: <path d="M12 5v14M5 12h14" />,
    group: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M21 20a6 6 0 0 0-5-5.9" /></>,
    file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={c}>{p[name]}</svg>;
}
