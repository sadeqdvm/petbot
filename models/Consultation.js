import mongoose, { Schema } from "mongoose";

const ConsultationSchema = new Schema(
  {
    chat: { type: Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
    phone: { type: String, required: true, index: true },
    petType: { type: String, default: "" },
    problem: { type: String, default: "" },
    duration: { type: String, default: "" },
    temperature: { type: String, default: "" },
    paymentStatus: { type: String, enum: ["pending", "submitted", "confirmed", "refunded"], default: "pending" },
    paymentAmount: { type: Number, default: 100 },
    status: { type: String, enum: ["open", "doctor_active", "completed", "emergency", "cancelled"], default: "open", index: true },
    paymentMessage: { type: Schema.Types.ObjectId, ref: "Message" },
    completedAt: { type: Date },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

export default mongoose.models.Consultation || mongoose.model("Consultation", ConsultationSchema);
