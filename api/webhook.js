const axios = require("axios");

// ======================================================
// ENV VARIABLES
// ======================================================

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const VET_NUMBER = "8801721417598";
const PROCESSED_MESSAGE_TTL_MS = 15 * 60 * 1000;
const STALE_MESSAGE_MAX_AGE_MS = 5 * 60 * 1000;
const DUPLICATE_FINGERPRINT_TTL_MS = 2 * 60 * 1000;
const MAX_PROCESSED_MESSAGES = 1000;

// ======================================================
// TEMP MEMORY
// ======================================================

const users = {};
const processedMessages = new Map();

// ======================================================
// MESSAGE SAFETY HELPERS
// ======================================================

function pruneProcessedMessages(now = Date.now()) {

  for (const [messageId, expiresAt] of processedMessages) {

    if (expiresAt <= now || processedMessages.size > MAX_PROCESSED_MESSAGES) {
      processedMessages.delete(messageId);
    }
  }
}

function hasRecentlyProcessedMessage(messageId, now = Date.now()) {

  if (!messageId) {
    return false;
  }

  pruneProcessedMessages(now);

  const expiresAt = processedMessages.get(messageId);

  if (expiresAt && expiresAt > now) {
    return true;
  }

  processedMessages.set(messageId, now + PROCESSED_MESSAGE_TTL_MS);

  return false;
}

function isStaleMessage(message, now = Date.now()) {

  const timestampSeconds = Number(message?.timestamp);

  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  return now - (timestampSeconds * 1000) > STALE_MESSAGE_MAX_AGE_MS;
}

function buildMessageFingerprint(message, text) {

  return [
    message.from || "",
    message.type || "",
    text || "",
    message.image?.id || "",
    message.document?.id || ""
  ].join(":");
}

function isDuplicateUserInput(user, fingerprint, now = Date.now()) {

  if (!fingerprint) {
    return false;
  }

  if (
    user.lastInboundFingerprint === fingerprint &&
    user.lastInboundAt &&
    now - user.lastInboundAt < DUPLICATE_FINGERPRINT_TTL_MS
  ) {
    return true;
  }

  user.lastInboundFingerprint = fingerprint;
  user.lastInboundAt = now;

  return false;
}


function isPetAnswer(text) {

  const value = (text || "").trim().toLowerCase();
  const petAnswers = [
    "1",
    "2",
    "3",
    "4",
    "বিড়াল",
    "বিড়াল",
    "কুকুর",
    "পাখি",
    "অন্যান্য",
    "cat",
    "dog",
    "bird",
    "other"
  ];

  return petAnswers.includes(value);
}

function createUser() {

  return {
    state: "ASK_PET",
    petType: "",
    problem: "",
    duration: "",
    temperature: "",
    paid: false,
    paymentMessageId: "",
    lastInboundFingerprint: "",
    lastInboundAt: 0
  };
}

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

async function handleMessage(userId, message, type, messageId) {

  let user = users[userId];
  const isNewUser = !user;

  if (!user) {
    user = createUser();
    users[userId] = user;
  }

  const fingerprint = buildMessageFingerprint(
    { from: userId, type },
    message
  );

  if (isDuplicateUserInput(user, fingerprint)) {

    console.log("Duplicate user input ignored:", userId, fingerprint);

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

  if (isNewUser && (type !== "text" || !isPetAnswer(message))) {

    await sendMessage(
      userId,
      "আসসালামু আলাইকুম 🐶🐱\n\nআপনার পোষা প্রাণীটি কী?\n\n১. বিড়াল\n২. কুকুর\n৩. পাখি\n৪. অন্যান্য"
    );

    return;
  }

  if (type !== "text" && !(user.state === "WAIT_PAYMENT" && type === "image")) {

    await sendMessage(
      userId,
      "অনুগ্রহ করে টেক্সট মেসেজ পাঠান।"
    );

    return;
  }

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
        isNewUser
          ? "আসসালামু আলাইকুম 🐶🐱\n\n🩺 আপনার পোষা প্রাণীর কী সমস্যা হচ্ছে?"
          : "🩺 আপনার পোষা প্রাণীর কী সমস্যা হচ্ছে?"
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

        if (user.paid) {

          console.log("Payment already confirmed, duplicate image ignored:", userId);

          break;
        }

        user.paid = true;
        user.paymentMessageId = messageId || "";

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

      console.log("Conversation already ended:", userId);

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

      const entries = req.body.entry || [];

      for (const entry of entries) {

        const changes = entry?.changes || [];

        for (const change of changes) {

          const value = change?.value;

          // Ignore statuses and other non-message webhook events.
          if (!value?.messages) {
            continue;
          }

          for (const message of value.messages) {

            // ======================================
            // DEDUPLICATION
            // ======================================

            const messageId = message.id;

            if (hasRecentlyProcessedMessage(messageId)) {

              console.log("Duplicate ignored:", messageId);

              continue;
            }

            if (isStaleMessage(message)) {

              console.log("Stale message ignored:", messageId, message.timestamp);

              continue;
            }

            // ======================================
            // IGNORE OWN
            // ======================================

            if (message.from_me) {
              continue;
            }

            const from = message.from;
            const type = message.type;

            let text = "";

            if (type === "text") {
              text = message.text?.body?.trim() || "";
            }

            console.log("FROM:", from);
            console.log("TYPE:", type);
            console.log("TEXT:", text);

            await handleMessage(from, text, type, messageId);
          }
        }
      }

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
