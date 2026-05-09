import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { publishDashboardEvent } from "@/lib/realtime";
import { serializeDocs } from "@/lib/serializers";
import Chat from "@/models/Chat";
import Consultation from "@/models/Consultation";

export async function GET(request) {
  await requireSession();
  await connectDb();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status")?.trim();
  const filter = {};

  if (q) {
    filter.$or = [
      { phone: { $regex: q, $options: "i" } },
      { petType: { $regex: q, $options: "i" } },
      { problem: { $regex: q, $options: "i" } }
    ];
  }
  if (status && status !== "all") filter.consultationStatus = status;

  const chats = await Chat.find(filter).sort({ lastMessageAt: -1 }).limit(100).lean();
  return NextResponse.json({ chats: serializeDocs(chats) });
}

export async function PATCH(request) {
  await requireSession();
  await connectDb();
  const { chatId, botEnabled, consultationStatus, paymentStatus } = await request.json();
  if (!chatId) return NextResponse.json({ error: "chatId is required" }, { status: 400 });

  const patch = {};
  if (typeof botEnabled === "boolean") {
    patch.botEnabled = botEnabled;
    if (!botEnabled) patch.consultationStatus = "doctor_active";
  }
  if (consultationStatus) {
    patch.consultationStatus = consultationStatus;
    if (consultationStatus === "completed") patch.completedAt = new Date();
  }
  if (paymentStatus) patch.paymentStatus = paymentStatus;

  const chat = await Chat.findByIdAndUpdate(chatId, patch, { new: true });
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  await Consultation.findOneAndUpdate(
    { chat: chat._id },
    {
      paymentStatus: chat.paymentStatus,
      status: chat.consultationStatus === "completed" ? "completed" : chat.consultationStatus === "doctor_active" ? "doctor_active" : "open",
      completedAt: chat.completedAt
    },
    { sort: { createdAt: -1 } }
  );
  await publishDashboardEvent("chat:updated", { chat: JSON.parse(JSON.stringify(chat)) });
  return NextResponse.json({ chat: JSON.parse(JSON.stringify(chat)) });
}
