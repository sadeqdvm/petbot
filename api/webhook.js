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

// Vet number (with country code)
const VET_NUMBER = "8801721417598";

// ======================================================
// TEMP STORAGE
// ======================================================

const users = {};
const processedMessages = new Set();

// ======================================================
// WEBHOOK VERIFICATION
// ======================================================

app.get("/", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Verification request received");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {

    console.log("Webhook verified");

    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ======================================================
// RECEIVE WEBHOOK EVENTS
// ======================================================

app.post("/", async (req, res) => {

  try {

    console.log(
      "FULL WEBHOOK:",
      JSON.stringify(req.body, null, 2)
    );

    const body = req.body;

    const message =
      body?.entry?.[0]
        ?.changes?.[0]
        ?.value?.messages?.[0];

    // Ignore non-message events
    if (!message) {
      return res.sendStatus(200);
    }

    // ==================================================
    // DUPLICATE PROTECTION
    // ==================================================

    const messageId = message.id;

    if (processedMessages.has(messageId)) {

      console.log("Duplicate message ignored");

      return res.sendStatus(200);
    }

    processedMessages.add(messageId);

    setTimeout(() => {
      processedMessages.delete(messageId);
    }, 5 * 60 * 1000);

    // ==================================================
    // EXTRACT MESSAGE
    // ==================================================

    const from = message.from;
    const type = message.type;

    let text = "";

    if (type === "text") {
      text = message.text?.body?.trim() || "";
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
      error.response?.data ||
      error.message ||
      error
    );

    return res.sendStatus(200);
  }
});

// ======================================================
// SEND WHATSAPP MESSAGE
// ======================================================

async function sendMessage(to, text) {

  try {

    console.log("Sending message to:", to);

    const response = await axios({
      method: "POST",
      url: `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      data: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: {
          preview_url: false,
          body: text
        }
      }
    });

    console.log("Message sent:", response.data);

  } catch (error) {

    console.error(
      "SEND ERROR:",
      error.response?.data ||
      error.message ||
      error
    );
  }
}

// ======================================================
// SEND CASE SUMMARY TO VET
// ======================================================

async function sendCaseToVet(userId, user) {

  const summary =
`🐾 নতুন কনসাল্টেশন

👤 User:
${userId}

🐶 Pet:
${user.petType}

🩺 Problem:
${user.problem}

⏳ Duration:
${user.duration}

🌡️ Temperature:
${user.temperature}

💰 Payment:
Confirmed`;

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

  const lower = text.toLowerCase();

  return keywords.some(word =>
    lower.includes(word)
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

  console.log("CURRENT STATE:", user.state);

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

      user.state = "ASK_TEMP";

      break;

    // ==================================================
    // ASK TEMPERATURE
    // ==================================================

    case "ASK_TEMP":

      user.temperature = message;

      await sendMessage(
        userId,
        "🩺 অনলাইন ভেট কনসাল্টেশন ফি: ১০০ টাকা\n\n📱 বিকাশ: 01721417598\n\nপেমেন্ট করে স্ক্রিনশট পাঠান 📸"
      );

      user.state = "WAIT_PAYMENT";

      break;

    // ==================================================
    // WAIT PAYMENT
    // ==================================================

    case "WAIT_PAYMENT":

      if (type === "image") {

        user.paid = true;

        // Send case to vet
        await sendCaseToVet(userId, user);

        await sendMessage(
          userId,
          "✅ পেমেন্ট গ্রহণ করা হয়েছে।\n\n⏱️ সাধারণত ৫-১০ মিনিটের মধ্যে ডাক্তার রিপ্লাই করবেন।"
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
    // DOCTOR TAKEOVER
    // ==================================================

    case "DOCTOR":

      console.log("Doctor takeover active");

      break;

    // ==================================================
    // END
    // ==================================================

    case "END":

      await sendMessage(
        userId,
        "ধন্যবাদ ❤️"
      );

      break;

    // ==================================================
    // DEFAULT
    // ==================================================

    default:

      user.state = "START";

      await sendMessage(
        userId,
        "আবার মেসেজ দিন।"
      );
  }

  // Save updated state
  users[userId] = user;

  console.log("UPDATED USER:");
  console.log(users[userId]);
}

// ======================================================
// EXPORT FOR VERCEL
// ======================================================

module.exports = app;