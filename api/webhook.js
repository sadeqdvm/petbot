const axios = require("axios");

// ======================================================
// ENV VARIABLES
// ======================================================

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VET_NUMBER = "8801721417598";

// ======================================================
// TEMP MEMORY FALLBACK
// ======================================================

const users = {};
const processedMessages = new Set();

// ======================================================
// SUPABASE REST HELPERS
// ======================================================

const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const supabaseRestUrl = supabaseEnabled
  ? `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`
  : "";

function supabaseHeaders(extraHeaders = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extraHeaders
  };
}

function dbConversationToUser(row) {
  if (!row) {
    return null;
  }

  return {
    state: row.state,
    petType: row.pet_type || "",
    problem: row.problem || "",
    duration: row.duration || "",
    temperature: row.temperature || "",
    paid: Boolean(row.paid)
  };
}

function userToDbConversation(userId, user) {
  return {
    user_id: userId,
    state: user.state,
    pet_type: user.petType || null,
    problem: user.problem || null,
    duration: user.duration || null,
    temperature: user.temperature || null,
    paid: Boolean(user.paid),
    last_message_at: new Date().toISOString()
  };
}

async function getUser(userId) {
  if (!supabaseEnabled) {
    return users[userId] || null;
  }

  try {
    const response = await axios.get(
      `${supabaseRestUrl}/conversations?user_id=eq.${encodeURIComponent(userId)}&select=*`,
      {
        headers: supabaseHeaders()
      }
    );

    return dbConversationToUser(response.data?.[0]);
  } catch (error) {
    console.error("SUPABASE GET USER ERROR:", error.response?.data || error.message);
    return users[userId] || null;
  }
}

async function saveUser(userId, user) {
  users[userId] = user;

  if (!supabaseEnabled) {
    return;
  }

  try {
    await axios.post(
      `${supabaseRestUrl}/conversations?on_conflict=user_id`,
      userToDbConversation(userId, user),
      {
        headers: supabaseHeaders({
          Prefer: "resolution=merge-duplicates"
        })
      }
    );
  } catch (error) {
    console.error("SUPABASE SAVE USER ERROR:", error.response?.data || error.message);
  }
}

async function recordInboundMessage(message) {
  const messageId = message.id;

  if (processedMessages.has(messageId)) {
    return false;
  }

  processedMessages.add(messageId);

  setTimeout(() => {
    processedMessages.delete(messageId);
  }, 60000);

  if (!supabaseEnabled) {
    return true;
  }

  try {
    await axios.post(
      `${supabaseRestUrl}/inbound_messages`,
      {
        message_id: messageId,
        user_id: message.from,
        message_type: message.type,
        message_text: message.text?.body || null,
        payload: message
      },
      {
        headers: supabaseHeaders()
      }
    );

    return true;
  } catch (error) {
    if (error.response?.status === 409) {
      console.log("Duplicate ignored:", messageId);
      return false;
    }

    console.error("SUPABASE MESSAGE LOG ERROR:", error.response?.data || error.message);
    return true;
  }
}

async function createVetCase(userId, user) {
  if (!supabaseEnabled) {
    return;
  }

  try {
    await axios.post(
      `${supabaseRestUrl}/vet_cases`,
      {
        user_id: userId,
        pet_type: user.petType || null,
        problem: user.problem || null,
        duration: user.duration || null,
        temperature: user.temperature || null,
        payment_confirmed: Boolean(user.paid),
        status: "sent_to_vet"
      },
      {
        headers: supabaseHeaders()
      }
    );
  } catch (error) {
    console.error("SUPABASE CASE ERROR:", error.response?.data || error.message);
  }
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

  await createVetCase(userId, user);

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

  let user = await getUser(userId);

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

    await saveUser(userId, users[userId]);

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

  await saveUser(userId, user);
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

      const messageRecorded = await recordInboundMessage(message);

      if (!messageRecorded) {
        return res.sendStatus(200);
      }

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
