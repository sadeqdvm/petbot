const axios = require("axios");

// ======================================================
// ENV VARIABLES
// ======================================================

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const VET_NUMBER = "8801721417598";

// ======================================================
// TEMP MEMORY
// ======================================================

const users = {};

// ======================================================
// SEND MESSAGE
// ======================================================

async function sendMessage(to, text) {

  try {

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
// SEND CASE TO VET
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
// EMERGENCY CHECK
// ======================================================

function isEmergency(text) {

  const keywords = [
    "bleeding",
    "not breathing",
    "seizure",
    "collapsed",
    "রক্ত",
    "খিঁচুনি"
  ];

  return keywords.some(k =>
    text.toLowerCase().includes(k)
  );
}

// ======================================================
// MAIN BOT LOGIC
// ======================================================

async function handleMessage(userId, message, type) {

  let user = users[userId] || {
    state: "START"
  };

  switch (user.state) {

    case "START":

      await sendMessage(
        userId,
        "আসসালামু আলাইকুম 🐶🐱\n\nআপনার পোষা প্রাণীটি কী?\n\n১. বিড়াল\n২. কুকুর\n৩. পাখি\n৪. অন্যান্য"
      );

      user.state = "ASK_PET";

      break;

    case "ASK_PET":

      user.petType = message;

      await sendMessage(
        userId,
        "🩺 কী সমস্যা হচ্ছে?"
      );

      user.state = "ASK_PROBLEM";

      break;

    case "ASK_PROBLEM":

      user.problem = message;

      if (isEmergency(message)) {

        await sendMessage(
          userId,
          "⚠️ জরুরি সমস্যা হতে পারে। দ্রুত ভেট ক্লিনিকে যোগাযোগ করুন।"
        );

        user.state = "END";

        break;
      }

      await sendMessage(
        userId,
        "⏳ কতদিন ধরে এই সমস্যা?"
      );

      user.state = "ASK_DURATION";

      break;

    case "ASK_DURATION":

      user.duration = message;

      await sendMessage(
        userId,
        "🌡️ তাপমাত্রা জানা থাকলে লিখুন। না জানলে লিখুন: জানি না"
      );

      user.state = "ASK_TEMP";

      break;

    case "ASK_TEMP":

      user.temperature = message;

      await sendMessage(
        userId,
        "💰 কনসাল্টেশন ফি: ১০০ টাকা\n\nবিকাশ: 01721417598\n\nস্ক্রিনশট পাঠান।"
      );

      user.state = "WAIT_PAYMENT";

      break;

    case "WAIT_PAYMENT":

      if (type === "image") {

        await sendCaseToVet(userId, user);

        await sendMessage(
          userId,
          "✅ পেমেন্ট গ্রহণ করা হয়েছে। ডাক্তার দ্রুত রিপ্লাই করবেন।"
        );

        user.state = "DOCTOR";

      } else {

        await sendMessage(
          userId,
          "📸 স্ক্রিনশট পাঠান।"
        );
      }

      break;

    case "DOCTOR":

      break;

    default:

      user.state = "START";
  }

  users[userId] = user;
}

// ======================================================
// MAIN VERCEL HANDLER
// ======================================================

module.exports = async (req, res) => {

  // ==========================================
  // VERIFY WEBHOOK
  // ==========================================

  if (req.method === "GET") {

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN
    ) {

      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  }

  // ==========================================
  // RECEIVE MESSAGE
  // ==========================================

  if (req.method === "POST") {

    try {

      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value?.messages) {
        return res.sendStatus(200);
      }

      const message = value.messages[0];

      const from = message.from;
      const type = message.type;

      let text = "";

      if (type === "text") {
        text = message.text?.body || "";
      }

      console.log("FROM:", from);
      console.log("TEXT:", text);

      await handleMessage(from, text, type);

      return res.sendStatus(200);

    } catch (error) {

      console.error(error);

      return res.sendStatus(500);
    }
  }

  return res.sendStatus(405);
};