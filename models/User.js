import mongoose, { Schema } from "mongoose";

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "doctor", "assistant"], default: "doctor" },
    online: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", UserSchema);
