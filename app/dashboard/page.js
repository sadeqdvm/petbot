import DashboardClient from "@/components/DashboardClient";

export default function DashboardPage() {
  return <DashboardClient pusherKey={process.env.NEXT_PUBLIC_PUSHER_KEY || ""} pusherCluster={process.env.NEXT_PUBLIC_PUSHER_CLUSTER || ""} />;
}
