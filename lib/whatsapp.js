import axios from "axios";
import Message from "@/models/Message";
import Chat from "@/models/Chat";
import { publishDashboardEvent } from "@/lib/realtime";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v20.0";

function assertWhatsAppEnv() {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required");
  }
}

export async function sendWhatsAppText(to, body) {
  assertWhatsAppEnv();
  const response = await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: true, body }
    },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" } }
  );
  return response.data?.messages?.[0]?.id;
}

export async function sendWhatsAppImage(to, imageUrl, caption = "") {
  assertWhatsAppEnv();
  const response = await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image: { link: imageUrl, caption }
    },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" } }
  );
  return response.data?.messages?.[0]?.id;
}

export async function fetchWhatsAppMediaBuffer(mediaId) {
  assertWhatsAppEnv();
  const metadata = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }
  });
  const media = await axios.get(metadata.data.url, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }
  });
  return { buffer: Buffer.from(media.data), contentType: metadata.data.mime_type || media.headers["content-type"] || "application/octet-stream" };
}

export async function storeOutboundMessage({ chat, text = "", type = "text", senderRole = "doctor", whatsappMessageId, mediaCaption = "", mediaId = "", templateKey }) {
  const message = await Message.create({
    chat: chat._id,
    whatsappMessageId,
    direction: "outbound",
    senderRole,
    type,
    text,
    mediaId,
    mediaCaption,
    templateKey,
    status: "sent"
  });

  chat.lastMessage = type === "image" ? mediaCaption || "📷 Image" : text;
  chat.lastMessageAt = new Date();
  await chat.save();
  await publishDashboardEvent("message:new", { chatId: String(chat._id), message: JSON.parse(JSON.stringify(message)), chat: JSON.parse(JSON.stringify(chat)) });
  return message;
}

export async function sendAndStoreText({ chat, text, senderRole = "doctor", templateKey }) {
  const whatsappMessageId = await sendWhatsAppText(chat.phone, text);
  return storeOutboundMessage({ chat, text, type: "text", senderRole, whatsappMessageId, templateKey });
}

export async function sendAndStoreImage({ chat, imageUrl, caption, senderRole = "doctor" }) {
  const whatsappMessageId = await sendWhatsAppImage(chat.phone, imageUrl, caption);
  return storeOutboundMessage({ chat, text: imageUrl, type: "image", senderRole, whatsappMessageId, mediaCaption: caption });
}
