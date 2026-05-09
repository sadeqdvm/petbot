"use client";

import Pusher from "pusher-js";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";

const templates = [
  ["payment_received", "Payment received"],
  ["doctor_joining", "Doctor joining soon"],
  ["emergency_visit", "Emergency visit advised"],
  ["consultation_completed", "Consultation completed"]
];

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

function timeAgo(date) {
  if (!date) return "";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export default function DashboardClient({ pusherKey, pusherCluster }) {
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [reply, setReply] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [stats, setStats] = useState({ dailyConsultations: 0, completedCases: 0, revenue: 0, activeChats: 0 });
  const [dark, setDark] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [vetOnline, setVetOnline] = useState(true);
  const endRef = useRef(null);

  const activeChatId = activeChat?._id;

  async function loadChats() {
    const params = new URLSearchParams({ q: search, status });
    const response = await fetch(`/api/chats?${params}`);
    if (response.ok) {
      const data = await response.json();
      setChats(data.chats);
      if (activeChatId) {
        const updated = data.chats.find((chat) => chat._id === activeChatId);
        if (updated) setActiveChat(updated);
      }
    }
  }

  async function loadStats() {
    const response = await fetch("/api/stats");
    if (response.ok) setStats(await response.json());
  }

  async function selectChat(chat) {
    setActiveChat(chat);
    const response = await fetch(`/api/chats/${chat._id}/messages`);
    if (response.ok) {
      const data = await response.json();
      setMessages(data.messages);
      setActiveChat(data.chat);
      setChats((items) => items.map((item) => (item._id === chat._id ? { ...item, unreadCount: 0 } : item)));
    }
  }

  async function patchChat(patch) {
    if (!activeChat) return;
    const response = await fetch("/api/chats", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: activeChat._id, ...patch })
    });
    if (response.ok) {
      const data = await response.json();
      setActiveChat(data.chat);
      setChats((items) => items.map((item) => (item._id === data.chat._id ? data.chat : item)));
    }
  }

  async function sendReply(payload) {
    if (!activeChat) return;
    const response = await fetch(`/api/chats/${activeChat._id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      setReply("");
      setImageUrl("");
      setImageCaption("");
    } else {
      alert((await response.json()).error || "Unable to send reply");
    }
  }

  function beepAndNotify(chat, message) {
    if (!notifications || message.direction !== "inbound") return;
    const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU9vT18AgICAgICAgICA/////4CAgICA/////4CAgICA");
    audio.play().catch(() => {});
    if (window.Notification?.permission === "granted") {
      new Notification(`New WhatsApp message from ${chat.phone}`, { body: message.text || message.mediaCaption || message.type, icon: "/favicon.ico" });
    }
  }

  async function enableNotifications() {
    if (window.Notification && Notification.permission !== "granted") await Notification.requestPermission();
    setNotifications(true);
  }

  useEffect(() => {
    loadChats();
    loadStats();
    const interval = setInterval(() => {
      loadChats();
      loadStats();
    }, 10000);
    return () => clearInterval(interval);
  }, [search, status]);

  useEffect(() => {
    if (!pusherKey || !pusherCluster) return;
    const pusher = new Pusher(pusherKey, { cluster: pusherCluster, authEndpoint: "/api/pusher/auth" });
    const channel = pusher.subscribe("private-clinic-dashboard");
    channel.bind("message:new", ({ chat, message }) => {
      setChats((items) => {
        const filtered = items.filter((item) => item._id !== chat._id);
        return [chat, ...filtered];
      });
      if (activeChatId === chat._id) {
        setMessages((items) => (items.some((item) => item._id === message._id) ? items : [...items, message]));
        setActiveChat(chat);
      }
      beepAndNotify(chat, message);
    });
    channel.bind("chat:updated", ({ chat }) => {
      setChats((items) => items.map((item) => (item._id === chat._id ? chat : item)));
      if (activeChatId === chat._id) setActiveChat(chat);
    });
    return () => {
      pusher.unsubscribe("private-clinic-dashboard");
      pusher.disconnect();
    };
  }, [pusherKey, pusherCluster, activeChatId, notifications]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeChatId]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const filteredChats = useMemo(() => chats, [chats]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-clinic-100 p-2 text-2xl dark:bg-clinic-900">🐾</div>
          <div><h1 className="font-bold">PetBot Clinic</h1><p className="text-xs text-slate-500">Meta WhatsApp Cloud API dashboard</p></div>
        </div>
        <div className="hidden gap-3 lg:flex">
          <Stat label="Today" value={stats.dailyConsultations} />
          <Stat label="Completed" value={stats.completedCases} />
          <Stat label="Revenue" value={`${stats.revenue}`} />
          <Stat label="Active" value={stats.activeChats} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setVetOnline(!vetOnline)} className={cls("rounded-full px-3 py-2 text-sm font-medium", vetOnline ? "bg-clinic-100 text-clinic-700 dark:bg-clinic-900 dark:text-clinic-100" : "bg-slate-200 text-slate-600 dark:bg-slate-800")}>{vetOnline ? "Online" : "Offline"}</button>
          <button onClick={enableNotifications} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700" title="Enable notifications">🔔</button>
          <button onClick={() => setDark(!dark)} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">{dark ? "☀️" : "🌙"}</button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_1fr_330px]">
        <aside className={cls(activeChat ? "hidden lg:flex" : "flex", "min-h-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900")}>
          <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
            <div className="relative"><span className="absolute left-3 top-3 text-slate-400">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search phone, pet, problem" className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 outline-none focus:border-clinic-500 dark:border-slate-700 dark:bg-slate-950" /></div>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-950"><option value="all">All chats</option><option value="new">New</option><option value="collecting_info">Collecting info</option><option value="awaiting_payment">Awaiting payment</option><option value="doctor_active">Doctor active</option><option value="completed">Completed</option><option value="emergency">Emergency</option></select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredChats.map((chat) => <ChatRow key={chat._id} chat={chat} active={activeChat?._id === chat._id} onClick={() => selectChat(chat)} />)}
            {!filteredChats.length && <p className="p-6 text-center text-sm text-slate-500">No chats found.</p>}
          </div>
        </aside>

        <section className={cls(activeChat ? "flex" : "hidden lg:flex", "min-h-0 flex-col")}>
          {activeChat ? (
            <>
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3"><button onClick={() => setActiveChat(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm lg:hidden dark:border-slate-700">Back</button><div><h2 className="font-semibold">{activeChat.displayName || activeChat.phone}</h2><p className="text-xs text-slate-500">{activeChat.petType || "Pet not set"} • {activeChat.consultationStatus}</p></div></div>
                <div className="flex gap-2"><a href={`/api/chats/${activeChat._id}/export`} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">Export PDF</a><button onClick={() => patchChat({ consultationStatus: "completed", botEnabled: false })} className="rounded-xl bg-clinic-600 px-3 py-2 text-sm font-semibold text-white">✓ Complete</button></div>
              </div>
              <div className="chat-bg min-h-0 flex-1 overflow-y-auto p-5">
                <div className="mx-auto max-w-3xl space-y-3">
                  {messages.map((message) => <MessageBubble key={message._id} message={message} />)}
                  <div ref={endRef} />
                </div>
              </div>
              <div className="shrink-0 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex flex-wrap gap-2">{templates.map(([key, label]) => <button key={key} onClick={() => sendReply({ templateKey: key })} className="rounded-full bg-clinic-50 px-3 py-1.5 text-xs font-medium text-clinic-700 ring-1 ring-clinic-100 dark:bg-clinic-950 dark:text-clinic-100 dark:ring-clinic-900">{label}</button>)}</div>
                <div className="mb-3 grid gap-2 md:grid-cols-[1fr_220px]">
                  <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="Paste public image URL to send image" className="rounded-2xl border border-slate-200 px-4 py-2 dark:border-slate-700 dark:bg-slate-950" />
                  <button disabled={!imageUrl} onClick={() => sendReply({ type: "image", imageUrl, caption: imageCaption })} className="rounded-2xl border border-slate-200 px-4 py-2 font-medium disabled:opacity-40 dark:border-slate-700">📷 Send image</button>
                  <input value={imageCaption} onChange={(event) => setImageCaption(event.target.value)} placeholder="Image caption" className="rounded-2xl border border-slate-200 px-4 py-2 dark:border-slate-700 dark:bg-slate-950 md:col-span-2" />
                </div>
                <form onSubmit={(event) => { event.preventDefault(); sendReply({ text: reply }); }} className="flex gap-2"><input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Type a manual reply..." className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-clinic-500 dark:border-slate-700 dark:bg-slate-950" /><button className="rounded-2xl bg-clinic-600 px-5 text-white">➤</button></form>
              </div>
            </>
          ) : <div className="grid h-full place-items-center text-slate-500"><div className="text-center"><div className="mx-auto text-4xl">🔊</div><p className="mt-3">Select a WhatsApp chat to start.</p></div></div>}
        </section>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:block">
          {activeChat ? <InfoPanel chat={activeChat} patchChat={patchChat} /> : <p className="text-sm text-slate-500">Customer info appears here.</p>}
        </aside>
      </main>
    </div>
  );
}

function Stat({ label, value }) { return <div className="rounded-2xl bg-slate-50 px-4 py-2 text-center dark:bg-slate-800"><div className="text-sm font-bold">{value}</div><div className="text-[11px] text-slate-500">{label}</div></div>; }
function ChatRow({ chat, active, onClick }) { return <button onClick={onClick} className={cls("flex w-full gap-3 border-b border-slate-100 p-4 text-left hover:bg-clinic-50 dark:border-slate-800 dark:hover:bg-slate-800", active && "bg-clinic-50 dark:bg-slate-800")}><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-clinic-100 font-bold text-clinic-700 dark:bg-clinic-900 dark:text-clinic-100">{(chat.displayName || chat.phone).slice(-2)}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate font-semibold">{chat.displayName || chat.phone}</p><span className="shrink-0 text-[11px] text-slate-400">{timeAgo(chat.lastMessageAt)}</span></div><p className="truncate text-sm text-slate-500">{chat.lastMessage}</p><div className="mt-1 flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] dark:bg-slate-800">{chat.petType || "unknown pet"}</span><span className={cls("rounded-full px-2 py-0.5 text-[10px]", chat.botEnabled ? "bg-clinic-100 text-clinic-700" : "bg-amber-100 text-amber-700")}>{chat.botEnabled ? "Bot" : "Doctor"}</span></div></div>{chat.unreadCount > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-clinic-600 px-2 text-xs font-bold text-white">{chat.unreadCount}</span>}</button>; }
function MessageBubble({ message }) { const mine = message.direction === "outbound"; return <div className={cls("flex", mine ? "justify-end" : "justify-start")}><div className={cls("max-w-[78%] rounded-2xl px-4 py-2 shadow-sm", mine ? "rounded-br-md bg-clinic-600 text-white" : "rounded-bl-md bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-50")}><div className="mb-1 text-[10px] uppercase opacity-70">{message.senderRole}</div>{message.type === "image" && message.mediaId && <img src={`/api/media/${message.mediaId}`} alt="WhatsApp upload" className="mb-2 max-h-80 rounded-xl object-contain" />}{message.type === "image" && !message.mediaId && <div className="mb-2 text-3xl">📷</div>}<p className="whitespace-pre-wrap text-sm">{message.text || message.mediaCaption || `[${message.type}]`}</p><p className="mt-1 text-right text-[10px] opacity-60">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div></div>; }
function InfoPanel({ chat, patchChat }) { const rows = [["Phone number", chat.phone], ["Pet type", chat.petType || "-"], ["Problem", chat.problem || "-"], ["Duration", chat.duration || "-"], ["Temperature", chat.temperature || "-"], ["Payment status", chat.paymentStatus], ["Bot state", chat.botState], ["Consultation", chat.consultationStatus]]; return <div><h2 className="text-lg font-bold">Customer information</h2><div className="mt-4 rounded-3xl border border-slate-200 p-4 dark:border-slate-800"><button onClick={() => patchChat({ botEnabled: !chat.botEnabled })} className={cls("mb-4 w-full rounded-2xl px-4 py-3 font-semibold text-white", chat.botEnabled ? "bg-clinic-600" : "bg-amber-600")}>{chat.botEnabled ? "Bot Active" : "Doctor Active"}</button><div className="space-y-3">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2 text-sm last:border-0 dark:border-slate-800"><span className="text-slate-500">{label}</span><span className="text-right font-medium">{value}</span></div>)}</div></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => patchChat({ paymentStatus: "confirmed" })} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">Confirm payment</button><button onClick={() => patchChat({ consultationStatus: "completed", botEnabled: false })} className="rounded-2xl bg-clinic-600 px-3 py-2 text-sm font-semibold text-white">Mark completed</button></div></div>; }
