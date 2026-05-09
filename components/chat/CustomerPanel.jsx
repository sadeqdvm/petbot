export default function CustomerPanel({ customer }) {
  return <aside className="card space-y-2"><h3 className="font-semibold">Customer Info</h3><p>{customer.name}</p><p>{customer.phone}</p><p>Status: {customer.takeover ? 'Doctor' : 'Bot'}</p><img alt="Payment screenshot" src={customer.paymentScreenshotUrl} className="rounded" /></aside>;
}
