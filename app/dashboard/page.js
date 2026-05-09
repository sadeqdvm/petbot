import AnalyticsCards from '@/components/dashboard/AnalyticsCards';
import ChatWindow from '@/components/chat/ChatWindow';
import CustomerPanel from '@/components/chat/CustomerPanel';
import { mockConversation } from '@/utils/mock';

export default function DashboardPage() {
  return <main className="space-y-4"><AnalyticsCards stats={{ active: 12, unread: 8, doctors: 4, todayRevenue: '$320' }} /><section className="grid lg:grid-cols-[2fr_1fr] gap-4"><ChatWindow conversation={mockConversation} /><CustomerPanel customer={mockConversation.customer} /></section></main>;
}
