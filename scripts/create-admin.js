require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

async function main() {
  const { MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!MONGODB_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("MONGODB_URI, ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }

  await mongoose.connect(MONGODB_URI);
  const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
    name: String,
    email: { type: String, unique: true, index: true },
    passwordHash: String,
    role: String,
    online: Boolean,
    lastSeenAt: Date
  }, { timestamps: true }));

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await User.findOneAndUpdate(
    { email: ADMIN_EMAIL.toLowerCase() },
    { name: ADMIN_NAME || "Clinic Admin", email: ADMIN_EMAIL.toLowerCase(), passwordHash, role: "admin" },
    { upsert: true, new: true }
  );
  await mongoose.disconnect();
  console.log(`Admin user ready: ${ADMIN_EMAIL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
