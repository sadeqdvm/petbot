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
const processedMessages = new Set();

// ======================================================
// SEND MESSAGE
// ======================================================

async function sendMessage(to, text) {

  try {

    console.log("Sending:", text);

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
// EMERGENCY CHECK
// ======================================================

function isEmergency(text) {

  const keywords = [
    "bleeding",
    "not breathing",
    "seizure",
    "collapsed",
    "রক্ত",
    "খিঁচুনি",
    "শ্বাস নিচ্ছে না"
  ];

  return keywords.some(k =>
    text.toLowerCase().includes(k)
  );
}

// ======================================================
// MAIN BOT LOGIC
// ======================================================

async function handleMessage(userId, message, type) {

  let user = users[userId];

  // ==========================================
  // NEW USER
  // ==========================================

  if (!user) {

    users[userId] = {
      state: "ASK_PET",
      petType: "",
      problem: "",
      duration: "",
      temperature: "",
      paid: false
    };

    await sendMessage(
      userId,
      "আসসালামু আলাইকুম 🐶🐱\n\nআপনার পোষা প্রাণীটি কী?\n\n১. বিড়াল\n২. কুকুর\n৩. পাখি\n৪. অন্যান্য"
    );

    return;
  }

  // ==========================================
  // LOGS
  // ==========================================

  console.log("================================");
  console.log("USER:", userId);
  console.log("STATE:", user.state);
  console.log("MESSAGE:", message);
  console.log("TYPE:", type);
  console.log("================================");

  // ==========================================
  // STATES
  // ==========================================

  switch (user.state) {

    // ======================================
    // ASK PET
    // ======================================

    case "ASK_PET":

      user.petType = message;

      user.state = "ASK_PROBLEM";

      await sendMessage(
        userId,
        "🩺 আপনার পোষা প্রাণীর কী সমস্যা হচ্ছে?"
      );

      break;

    // ======================================
    // ASK PROBLEM
    // ======================================

    case "ASK_PROBLEM":

      user.problem = message;

      if (isEmergency(message)) {

        await sendMessage(
          userId,
          "⚠️ এটি জরুরি সমস্যা হতে পারে। দ্রুত নিকটস্থ ভেট ক্লিনিকে যোগাযোগ করুন।"
        );

        user.state = "END";

        break;
      }

      user.state = "ASK_DURATION";

      await sendMessage(
        userId,
        "⏳ কতদিন ধরে এই সমস্যা হচ্ছে?"
      );

      break;

    // ======================================
    // ASK DURATION
    // ======================================

    case "ASK_DURATION":

      user.duration = message;

      user.state = "ASK_TEMP";

      await sendMessage(
        userId,
        "🌡️ শরীরের তাপমাত্রা জানা থাকলে লিখুন। না জানলে লিখুন: জানি না"
      );

      break;

    // ======================================
    // ASK TEMP
    // ======================================

    case "ASK_TEMP":

      user.temperature = message;

      user.state = "WAIT_PAYMENT";

      await sendMessage(
        userId,
        "💰 অনলাইন কনসাল্টেশন ফি: ১০০ টাকা\n\nবিকাশ: 01721417598\n\nপেমেন্ট করে স্ক্রিনশট পাঠান।"
      );

      break;

    // ======================================
    // WAIT PAYMENT
    // ======================================

    case "WAIT_PAYMENT":

      if (type === "image") {

        user.paid = true;

        user.state = "DOCTOR";

        await sendCaseToVet(userId, user);

        await sendMessage(
          userId,
          "✅ পেমেন্ট গ্রহণ করা হয়েছে।\nডাক্তার দ্রুত রিপ্লাই করবেন।"
        );

      } else {

        await sendMessage(
          userId,
          "📸 অনুগ্রহ করে পেমেন্টের স্ক্রিনশট পাঠান।"
        );
      }

      break;

    // ======================================
    // DOCTOR
    // ======================================

    case "DOCTOR":

      console.log("Doctor handling:", userId);

      break;

    // ======================================
    // END
    // ======================================

    case "END":

      await sendMessage(
        userId,
        "ধন্যবাদ ❤️"
      );

      break;

    default:

      user.state = "ASK_PET";

      await sendMessage(
        userId,
        "আবার শুরু করুন 😊\nআপনার পোষা প্রাণীটি কী?"
      );
  }

  users[userId] = user;
}

// ======================================================
// VERCEL HANDLER
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
  // RECEIVE EVENTS
  // ==========================================

  if (req.method === "POST") {

    try {

      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Ignore statuses
      if (!value?.messages) {
        return res.sendStatus(200);
      }

      const message = value.messages[0];

      // ======================================
      // DEDUPLICATION
      // ======================================

      const messageId = message.id;

      if (processedMessages.has(messageId)) {

        console.log("Duplicate ignored:", messageId);

        return res.sendStatus(200);
      }

      processedMessages.add(messageId);

      setTimeout(() => {
        processedMessages.delete(messageId);
      }, 60000);

      // ======================================
      // IGNORE OWN
      // ======================================

      if (message.from_me) {
        return res.sendStatus(200);
      }

      const from = message.from;
      const type = message.type;

      let text = "";

      if (type === "text") {
        text = message.text?.body || "";
      }

      console.log("FROM:", from);
      console.log("TYPE:", type);
      console.log("TEXT:", text);

      await handleMessage(from, text, type);

      return res.sendStatus(200);

    } catch (error) {

      console.error(
        "WEBHOOK ERROR:",
        error.response?.data || error.message
      );

      return res.sendStatus(500);
    }
  }

  return res.sendStatus(405);
};