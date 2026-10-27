"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

type Note = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
};

const TABS = [
  { id: "all", label: "All" },
  { id: "approvals", label: "Approvals" },
  { id: "batches", label: "Batches" },
] as const;

export default function NotificationsMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);

  async function load() {
    const res = await fetch("/api/notifications");
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return;
    setItems(data.notifications || []);
    setUnread(data.unread || 0);
    setEmailEnabled(Boolean(data.emailEnabled));
    setInAppEnabled(data.inAppEnabled !== false);
  }

  useEffect(() => {
    load().catch(() => {});
    const timer = window.setInterval(() => load().catch(() => {}), 18000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = items.filter((item) => {
    if (tab === "approvals") return item.kind === "approval_needed";
    if (tab === "batches") return item.kind === "batch_finished";
    return true;
  });

  async function markAll() {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnread(0);
  }

  async function openItem(item: Note) {
    if (!item.read) {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
      setUnread((count) => Math.max(0, count - 1));
    }
    setOpen(false);
    router.push(item.href);
  }

  async function toggle(key: "emailEnabled" | "inAppEnabled", value: boolean) {
    if (key === "emailEnabled") setEmailEnabled(value);
    else setInAppEnabled(value);
    const res = await fetch("/api/notifications/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    if (res.ok) load().catch(() => {});
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg p-2 text-[#8A8A9A] hover:bg-white/5 hover:text-[#E8E8F0]"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#8B5CF6]" />}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-1.5rem,22rem)] rounded-[10px] border border-[#23232F] bg-[#12121A] p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium">Notifications</p>
            <button type="button" onClick={markAll} className="text-[12px] text-[#C4B5FD] hover:underline">
              Mark all read
            </button>
          </div>
          <div className="mb-2 flex gap-1" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`rounded-full px-2.5 py-1 text-[12px] ${tab === item.id ? "bg-[#8B5CF6] text-white" : "text-[#8A8A9A] hover:bg-white/5"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {visible.length === 0 && (
              <li className="px-1 py-6 text-center text-[12px] text-[#8A8A9A]">
                {inAppEnabled ? "Nothing in this tab yet." : "In-app notifications are off. New events are still stored."}
              </li>
            )}
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className={`w-full rounded-lg px-2 py-2 text-left hover:bg-white/5 ${item.read ? "opacity-70" : ""}`}
                >
                  <span className="flex items-center gap-2 text-[13px] font-medium">
                    {!item.read && <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" />}
                    {item.title}
                  </span>
                  {item.body && <span className="mt-0.5 block text-[12px] text-[#8A8A9A]">{item.body}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-2 border-t border-[#23232F] pt-3 text-[12px]">
            <label className="flex items-center justify-between gap-3">
              Email
              <input type="checkbox" checked={emailEnabled} onChange={(event) => toggle("emailEnabled", event.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-3">
              In-app
              <input type="checkbox" checked={inAppEnabled} onChange={(event) => toggle("inAppEnabled", event.target.checked)} />
            </label>
            <p className="text-[#8A8A9A]">Email sends only when RESEND_API_KEY is set. A failed send does not block the event.</p>
          </div>
        </div>
      )}
    </div>
  );
}
