export default function AnalyticsCards({ stats }) {
  return <section className="grid md:grid-cols-4 gap-4">{Object.entries(stats).map(([k,v]) => <div key={k} className="card"><p className="text-slate-400">{k}</p><p className="text-2xl font-semibold">{v}</p></div>)}</section>;
}
