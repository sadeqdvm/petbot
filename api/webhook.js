require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

// ======================================================
// ENV VARIABLES
// ======================================================

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Vet WhatsApp number
// Format: country code + number (NO +)
const VET_NUMBER = "8801721417598";

// ======================================================
// TEMP USER STORAGE (MVP)
// Replace later with MongoDB / Firebase
// ======================================================

const users = {};

// ======================================================
// WEBHOOK VERIFICATION
// IMPORTANT FOR VERCEL:
// URL = /api/webhook
// INSIDE FILE = "/"
// ======================================================

app.get("/", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Verification request received");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {

    console.log("Webhook verified successfully");

    return res.status(200).send(challenge);
  }

  console.log("Verification failed");

  return res.sendStatus(403);
});

// ======================================================
// RECEIVE WHATSAPP EVENTS
// ======================================================

app.post("/", async (req, res) => {

  try {

    console.log(
      "Incoming Webhook:",
      JSON.stringify(req.body, null, 2)
    );

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Ignore if no messages
    if (!value?.messages) {
      return res.sendStatus(200);
    }

    const message = value.messages[0];

    // Ignore own messages
    if (message.from_me) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const type = message.type;

    let text = "";

    // Handle text messages
    if (type === "text") {
      text = message.text?.body || "";
    }

    console.log("================================");
    console.log("FROM:", from);
    console.log("TYPE:", type);
    console.log("TEXT:", text);
    console.log("================================");

    await handleMessage(from, text, type);

    return res.sendStatus(200);

  } catch (error) {

    console.error(
      "WEBHOOK ERROR:",
      error.response?.data || error.message
    );

    return res.sendStatus(500);
  }
});

// ======================================================
// SEND WHATSAPP MESSAGE
// ======================================================

async function sendMessage(to, text) {

  try {

    console.log(`Sending message to ${to}`);

    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: {
          body: text
        }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {

    console.error(
      "SEND ERROR:",
      error.response?.data || error.message
    );
  }
}

// ======================================================
// SEND CASE SUMMARY TO VET
// ======================================================

async function sendCaseToVet(userId, user) {

  const summary =
`🐾 নতুন কনসাল্টেশন

👤 User: ${userId}

🐶 Pet Type: ${user.petType}

🩺 Problem:
${user.problem}

⏳ Duration:
${user.duration}

🌡️ Temperature:
${user.temperature}

💰 Payment: Confirmed`;

  await sendMessage(VET_NUMBER, summary);
}

// ======================================================
// EMERGENCY DETECTION
// ======================================================

function isEmergency(text) {

  const keywords = [
    "bleeding",
    "not breathing",
    "seizure",
    "collapsed",
    "unconscious",
    "রক্ত",
    "শ্বাস নিচ্ছে না",
    "খিঁচুনি",
    "অজ্ঞান"
  ];

  const lowerText = text.toLowerCase();

  return keywords.some(keyword =>
    lowerText.includes(keyword)
  );
}

// ======================================================
// MAIN BOT LOGIC
// ======================================================

async function handleMessage(userId, message, type) {

  let user = users[userId] || {
    state: "START",
    petType: "",
    problem: "",
    duration: "",
    temperature: "",
    paid: false
  };

  console.log("================================");
  console.log("USER:", userId);
  console.log("STATE:", user.state);
  console.log("MESSAGE:", message);
  console.log("TYPE:", type);
  console.log("================================");

  switch (user.state) {

    // ==================================================
    // START
    // ==================================================

    case "START":

      await sendMessage(
        userId,
        "আসসালামু আলাইকুম 🐶🐱\n\nআপনার পোষা প্রাণীটি কী?\n\n১. বিড়াল\n২. কুকুর\n৩. পাখি\n৪. অন্যান্য"
      );

      user.state = "ASK_PET";

      break;

    // ==================================================
    // ASK PET TYPE
    // ==================================================

    case "ASK_PET":

      if (
        message === "১" ||
        message === "1" ||
        message.includes("বিড়াল")
      ) {
        user.petType = "Cat";
      }

      else if (
        message === "২" ||
        message === "2" ||
        message.includes("কুকুর")
      ) {
        user.petType = "Dog";
      }

      else if (
        message === "৩" ||
        message === "3" ||
        message.includes("পাখি")
      ) {
        user.petType = "Bird";
      }

      else {
        user.petType = "Other";
      }

      await sendMessage(
        userId,
        "🩺 আপনার পোষা প্রাণীর কী সমস্যা হচ্ছে?"
      );

      user.state = "ASK_PROBLEM";

      break;

    // ==================================================
    // ASK PROBLEM
    // ==================================================

    case "ASK_PROBLEM":

      user.problem = message;

      // Emergency detection
      if (isEmergency(message)) {

        await sendMessage(
          userId,
          "⚠️ এটি জরুরি সমস্যা হতে পারে।\n\nদ্রুত নিকটস্থ ভেট ক্লিনিকে যোগাযোগ করুন।"
        );

        user.state = "END";

        break;
      }

      await sendMessage(
        userId,
        "⏳ কতদিন ধরে এই সমস্যা হচ্ছে?"
      );

      user.state = "ASK_DURATION";

      break;

    // ==================================================
    // ASK DURATION
    // ==================================================

    case "ASK_DURATION":

      user.duration = message;

      await sendMessage(
        userId,
        "🌡️ শরীরের তাপমাত্রা জানা থাকলে লিখুন।\n\nনা জানলে লিখুন: জানি না"
      );

      user.state = "ASK_TEMPERATURE";

      break;

    // ==================================================
    // ASK TEMPERATURE
    // ==================================================

    case "ASK_TEMPERATURE":

      user.temperature = message;

      await sendMessage(
        userId,
        "🩺 আমাদের অভিজ্ঞ ভেট ডাক্তার আপনার পোষা প্রাণীর সমস্যার সমাধানে সহায়তা করবেন।\n\n💰 অনলাইন কনসাল্টেশন ফি: ১০০ টাকা\n\n📱 বিকাশ: 01721417598\n\nপেমেন্ট করে স্ক্রিনশট পাঠান।"
      );

      user.state = "WAIT_PAYMENT";

      break;

    // ==================================================
    // WAIT PAYMENT
    // ==================================================

    case "WAIT_PAYMENT":

      // Detect image screenshot
      if (type === "image") {

        user.paid = true;

        // Send case summary to vet
        await sendCaseToVet(userId, user);

        await sendMessage(
          userId,
          "✅ পেমেন্ট গ্রহণ করা হয়েছে।\n\n⏱️ সাধারণত ৫-১০ মিনিটের মধ্যে ভেট ডাক্তার রিপ্লাই করবেন।"
        );

        user.state = "DOCTOR";

      } else {

        await sendMessage(
          userId,
          "📸 অনুগ্রহ করে পেমেন্টের স্ক্রিনশট পাঠান।"
        );
      }

      break;

    // ==================================================
    // DOCTOR HANDOVER
    // ==================================================

    case "DOCTOR":

      console.log(
        `Doctor takeover active for ${userId}`
      );

      // Bot stops here
      break;

    // ==================================================
    // END
    // ==================================================

    case "END":

      await sendMessage(
        userId,
        "ধন্যবাদ ❤️\n\nপ্রয়োজনে আবার যোগাযোগ করুন।"
      );

      break;

    // ==================================================
    // DEFAULT
    // ==================================================

    default:

      user.state = "START";

      await sendMessage(
        userId,
        "সিস্টেম পুনরায় চালু হয়েছে। আবার মেসেজ দিন।"
      );
  }

  // Save user state
  users[userId] = user;

  console.log("Updated User:");
  console.log(users[userId]);
}

// ======================================================
// EXPORT FOR VERCEL
// IMPORTANT: NO app.listen()
// ======================================================

module.exports = app;