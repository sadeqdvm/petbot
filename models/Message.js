import mongoose, { Schema } from "mongoose";

const MessageSchema = new Schema(
  {
    chat: { type: Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
    whatsappMessageId: { type: String, sparse: true, unique: true, index: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true, index: true },
    senderRole: { type: String, enum: ["customer", "bot", "doctor", "system"], required: true },
    type: { type: String, enum: ["text", "image", "document", "audio", "video", "sticker", "unknown"], default: "text" },
    text: { type: String, default: "" },
    mediaId: { type: String, index: true },
    mediaMimeType: { type: String },
    mediaSha256: { type: String },
    mediaCaption: { type: String, default: "" },
    templateKey: { type: String },
    status: { type: String, enum: ["received", "sent", "failed"], default: "received" },
    raw: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

MessageSchema.index({ chat: 1, createdAt: 1 });

export default mongoose.models.Message || mongoose.model("Message", MessageSchema);
