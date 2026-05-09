import { NextResponse } from "next/server";
import { startOfDay } from "date-fns";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import Chat from "@/models/Chat";
import Consultation from "@/models/Consultation";

export async function GET() {
  await requireSession();
  await connectDb();
  const today = startOfDay(new Date());
  const [dailyConsultations, completedCases, paidConsultations] = await Promise.all([
    Consultation.countDocuments({ createdAt: { $gte: today } }),
    Consultation.countDocuments({ status: "completed" }),
    Consultation.find({ paymentStatus: { $in: ["submitted", "confirmed"] } }).select("paymentAmount").lean()
  ]);
  const activeChats = await Chat.countDocuments({ consultationStatus: { $ne: "completed" } });
  const revenue = paidConsultations.reduce((sum, item) => sum + (item.paymentAmount || 0), 0);
  return NextResponse.json({ dailyConsultations, completedCases, revenue, activeChats });
}
