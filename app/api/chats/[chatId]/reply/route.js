import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import Chat from "@/models/Chat";
import { QUICK_REPLIES } from "@/lib/bot";
import { sendAndStoreImage, sendAndStoreText } from "@/lib/whatsapp";

export async function POST(request, { params }) {
  await requireSession();
  await connectDb();
  const body = await request.json();
  const chat = await Chat.findById(params.chatId);
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  chat.botEnabled = false;
  chat.consultationStatus = chat.consultationStatus === "completed" ? "completed" : "doctor_active";
  await chat.save();

  let message;
  if (body.templateKey) {
    const text = QUICK_REPLIES[body.templateKey];
    if (!text) return NextResponse.json({ error: "Unknown template" }, { status: 400 });
    message = await sendAndStoreText({ chat, text, senderRole: "doctor", templateKey: body.templateKey });
  } else if (body.type === "image") {
    if (!body.imageUrl) return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    message = await sendAndStoreImage({ chat, imageUrl: body.imageUrl, caption: body.caption || "", senderRole: "doctor" });
  } else {
    if (!body.text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });
    message = await sendAndStoreText({ chat, text: body.text.trim(), senderRole: "doctor" });
  }

  return NextResponse.json({ message: JSON.parse(JSON.stringify(message)), chat: JSON.parse(JSON.stringify(chat)) });
}
