'use client';
export default function CustomerPanel({ customer }) {
  async function toggleTakeover(enabled) {
    if (!customer?.id) return;
    await fetch('/api/takeover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: customer.id, enabled }) });
  }
  return <aside className="card space-y-2"><h3 className="font-semibold">Customer Info</h3><p>{customer?.phone}</p><p>Status: {customer?.state}</p><div className="flex gap-2"><button onClick={()=>toggleTakeover(true)} className="bg-amber-600 px-2 py-1 rounded">Doctor takeover</button><button onClick={()=>toggleTakeover(false)} className="bg-slate-700 px-2 py-1 rounded">Bot mode</button></div></aside>;
}
