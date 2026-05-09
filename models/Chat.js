import mongoose, { Schema } from "mongoose";

const ChatSchema = new Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, trim: true },
    petType: { type: String, default: "", index: true },
    problem: { type: String, default: "" },
    duration: { type: String, default: "" },
    temperature: { type: String, default: "" },
    paymentStatus: { type: String, enum: ["pending", "submitted", "confirmed", "refunded"], default: "pending", index: true },
    botState: { type: String, default: "ASK_PET", index: true },
    botEnabled: { type: Boolean, default: true, index: true },
    consultationStatus: { type: String, enum: ["new", "collecting_info", "awaiting_payment", "doctor_active", "completed", "emergency"], default: "new", index: true },
    unreadCount: { type: Number, default: 0 },
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastInboundAt: { type: Date },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

ChatSchema.index({ phone: "text", petType: "text", problem: "text" });

export default mongoose.models.Chat || mongoose.model("Chat", ChatSchema);
