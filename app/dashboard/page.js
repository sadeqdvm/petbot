'use client';
import { useEffect, useState } from 'react';
import AnalyticsCards from '@/components/dashboard/AnalyticsCards';
import ChatWindow from '@/components/chat/ChatWindow';
import CustomerPanel from '@/components/chat/CustomerPanel';
import { getSupabaseBrowserClient } from '@/lib/supabase';

export default function DashboardPage() {
  const [chats, setChats] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({});

  const load = async () => {
    const [c, a] = await Promise.all([fetch('/api/chats').then(r=>r.json()), fetch('/api/analytics').then(r=>r.json())]);
    setChats(c.data || []);
    setStats(a.data || {});
    if (!selected && c.data?.[0]) setSelected(c.data[0]);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selected?.id) fetch(`/api/messages?conversationId=${selected.id}`).then(r=>r.json()).then(d=>setMessages(d.data || [])); }, [selected?.id]);
  useEffect(() => {
    const channel = getSupabaseBrowserClient().channel('messages-live').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => load()).subscribe();
    return () => getSupabaseBrowserClient().removeChannel(channel);
  }, []);

  return <main className="space-y-4"><AnalyticsCards stats={stats} /><section className="grid lg:grid-cols-[300px_2fr_1fr] gap-4"><div className="card h-[70vh] overflow-auto">{chats.map((c)=><button key={c.id} onClick={()=>setSelected(c)} className="w-full text-left p-2 border-b border-slate-700"><p>{c.phone}</p><p className="text-xs text-slate-400">{c.last_message}</p></button>)}</div><ChatWindow conversation={{id:selected?.id, phone:selected?.phone, messages}} /><CustomerPanel customer={selected} /></section></main>;
}
