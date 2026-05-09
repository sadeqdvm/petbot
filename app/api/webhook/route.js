import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { publishDashboardEvent } from "@/lib/realtime";
import { runBotStateMachine } from "@/lib/bot";
import Chat from "@/models/Chat";
import Message from "@/models/Message";

export const dynamic = "force-dynamic";

function getMessageText(message) {
  if (message.type === "text") return message.text?.body || "";
  if (message.type === "image") return message.image?.caption || "";
  if (message.type === "button") return message.button?.text || "";
  if (message.type === "interactive") return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "";
  return "";
}

function getMediaFields(message) {
  const media = message[message.type] || {};
  return {
    mediaId: media.id,
    mediaMimeType: media.mime_type,
    mediaSha256: media.sha256,
    mediaCaption: media.caption || ""
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request) {
  await connectDb();
  const payload = await request.json();

  const changes = payload.entry?.flatMap((entry) => entry.changes || []) || [];
  for (const change of changes) {
    const value = change.value;
    if (!value?.messages?.length) continue;

    const contactByWaId = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact.profile?.name || ""]));

    for (const incoming of value.messages) {
      if (!incoming.id || !incoming.from || incoming.from_me) continue;

      const existing = await Message.findOne({ whatsappMessageId: incoming.id }).select("_id").lean();
      if (existing) continue;

      const text = getMessageText(incoming);
      const messageType = ["text", "image", "document", "audio", "video", "sticker"].includes(incoming.type) ? incoming.type : "unknown";
      const now = incoming.timestamp ? new Date(Number(incoming.timestamp) * 1000) : new Date();

      const chat = await Chat.findOneAndUpdate(
        { phone: incoming.from },
        {
          $setOnInsert: { phone: incoming.from, botState: "NEW", consultationStatus: "new" },
          $set: {
            displayName: contactByWaId.get(incoming.from) || undefined,
            lastMessage: messageType === "image" ? text || "📷 Image" : text || `[${messageType}]`,
            lastMessageAt: now,
            lastInboundAt: now
          },
          $inc: { unreadCount: 1 }
        },
        { upsert: true, new: true }
      );

      let message;
      try {
        message = await Message.create({
          chat: chat._id,
          whatsappMessageId: incoming.id,
          direction: "inbound",
          senderRole: "customer",
          type: messageType,
          text,
          ...getMediaFields(incoming),
          raw: incoming,
          createdAt: now,
          updatedAt: now
        });
      } catch (error) {
        if (error?.code === 11000) continue;
        throw error;
      }

      await publishDashboardEvent("message:new", { chatId: String(chat._id), message: JSON.parse(JSON.stringify(message)), chat: JSON.parse(JSON.stringify(chat)) });
      try {
        await runBotStateMachine(chat, text, messageType, message);
      } catch (error) {
        console.error("Bot processing failed", error);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
