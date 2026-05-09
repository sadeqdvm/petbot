import Link from 'next/link';

export default function DashboardLayout({ children }) {
  return <div className="min-h-screen p-4 md:p-8"><nav className="mb-6 flex gap-4"><Link href="/dashboard">Conversations</Link><Link href="/dashboard/analytics">Analytics</Link><Link href="/dashboard/settings">Settings</Link></nav>{children}</div>;
}
