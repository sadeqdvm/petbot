import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import Chat from "@/models/Chat";
import Message from "@/models/Message";

function createPdfBuffer(chat, messages) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(20).text("Veterinary WhatsApp Consultation", { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(`Phone: ${chat.phone}`);
    doc.text(`Pet type: ${chat.petType || "-"}`);
    doc.text(`Problem: ${chat.problem || "-"}`);
    doc.text(`Payment: ${chat.paymentStatus}`);
    doc.text(`Status: ${chat.consultationStatus}`);
    doc.moveDown();

    messages.forEach((message) => {
      const who = message.direction === "inbound" ? "Customer" : message.senderRole;
      doc.fontSize(9).fillColor("#64748b").text(`${new Date(message.createdAt).toLocaleString()} • ${who}`);
      doc.fontSize(11).fillColor("#111827").text(message.text || message.mediaCaption || `[${message.type}]`);
      if (message.mediaId) doc.fontSize(9).fillColor("#047857").text(`Media ID: ${message.mediaId}`);
      doc.moveDown(0.6);
    });

    doc.end();
  });
}

export async function GET(_request, { params }) {
  await requireSession();
  await connectDb();
  const chat = await Chat.findById(params.chatId).lean();
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  const messages = await Message.find({ chat: params.chatId }).sort({ createdAt: 1 }).lean();
  const pdf = await createPdfBuffer(chat, messages);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="consultation-${chat.phone}.pdf"`
    }
  });
}
