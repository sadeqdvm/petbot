'use client';
import { useState } from 'react';

export default function ChatWindow({ conversation }) {
  const [reply, setReply] = useState('');
  async function send() {
    if (!reply || !conversation?.id) return;
    await fetch('/api/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: conversation.phone, body: reply, conversationId: conversation.id }) });
    setReply('');
  }
  return <div className="card h-[70vh] flex flex-col"><div className="flex-1 overflow-auto space-y-3">{(conversation?.messages||[]).map((m)=><div key={m.id} className={`max-w-[80%] p-3 rounded-xl ${m.direction==='inbound'?'bg-slate-700':'bg-green-700 ml-auto'}`}>{m.body}</div>)}</div><div className="mt-4 flex gap-2"><input className="flex-1 bg-slate-800 rounded p-3" value={reply} onChange={(e)=>setReply(e.target.value)} placeholder="Manual reply" /><button onClick={send} className="bg-green-600 px-4 rounded">Send</button></div></div>;
}
