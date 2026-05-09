import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { serializeDocs } from "@/lib/serializers";
import Chat from "@/models/Chat";
import Message from "@/models/Message";

export async function GET(_request, { params }) {
  await requireSession();
  await connectDb();
  const chat = await Chat.findByIdAndUpdate(params.chatId, { unreadCount: 0 }, { new: true }).lean();
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  const messages = await Message.find({ chat: params.chatId }).sort({ createdAt: 1 }).limit(500).lean();
  return NextResponse.json({ chat, messages: serializeDocs(messages) });
}
