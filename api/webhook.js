const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// ======================================================
// ENV VARIABLES
// ======================================================

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VET_NUMBER = "8801721417598";
const PROCESSED_MESSAGE_TTL_MS = 15 * 60 * 1000;
const STALE_MESSAGE_MAX_AGE_MS = 5 * 60 * 1000;
const DUPLICATE_FINGERPRINT_TTL_MS = 2 * 60 * 1000;
const MAX_PROCESSED_MESSAGES = 1000;

// ======================================================
// TEMP MEMORY FALLBACK
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
// SUPABASE PERSISTENCE HELPERS
// ======================================================

async function recordMessage({ whatsappMessageId, conversationId, userId, direction, type, body, rawPayload, mediaUrl }) {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      whatsapp_message_id: whatsappMessageId || null,
      conversation_id: conversationId || null,
      whatsapp_user_id: userId,
      direction,
      message_type: type,
      body: body || "",
      media_url: mediaUrl || null,
      raw_payload: rawPayload || null
    })
    .select("*")
    .single();

  if (error) {
    console.error("MESSAGE PERSIST ERROR:", error.message);
  }

  await broadcastDashboardEvent("message", data || {
    conversation_id: conversationId,
    whatsapp_user_id: userId,
    direction,
    message_type: type,
    body: body || ""
  });

  return data;
}

async function markMessageProcessed(messageId) {
  const { error } = await supabase
    .from("processed_messages")
    .insert({ whatsapp_message_id: messageId });

  if (error?.code === "23505") {
    return false;
  }

  if (error) {
    throw error;
  }

  return true;
}

async function getConversation(userId) {
  const { data, error } = await supabase
    .from("bot_conversations")
    .select("*")
    .eq("whatsapp_user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function createConversation(userId) {
  const { data, error } = await supabase
    .from("bot_conversations")
    .insert({
      whatsapp_user_id: userId,
      state: "ASK_PET",
      pet_type: "",
      problem: "",
      duration: "",
      temperature: "",
      paid: false
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await broadcastDashboardEvent("conversation", data);
  return data;
}

async function updateConversation(id, patch) {
  const { data, error } = await supabase
    .from("bot_conversations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await broadcastDashboardEvent("conversation", data);
  return data;
}

async function broadcastDashboardEvent(event, payload) {
  try {
    const channel = supabase.channel("dashboard");
    await channel.send({ type: "broadcast", event, payload });
    await supabase.removeChannel(channel);
  } catch (error) {
    console.error("REALTIME BROADCAST ERROR:", error.message);
  }
}

// ======================================================
// META WHATSAPP CLOUD API HELPERS
// ======================================================

async function sendMessage(to, text, options = {}) {
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

    await recordMessage({
      conversationId: options.conversationId || null,
      userId: to,
      direction: "outbound",
      type: "text",
      body: text
    });
  } catch (error) {
    console.error(
      "SEND ERROR:",
      error.response?.data || error.message
    );
  }
}

async function downloadWhatsAppMedia(mediaId) {
  const metadata = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`
    }
  });

  const media = await axios.get(metadata.data.url, {
    responseType: "arraybuffer",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`
    }
  });

  return {
    buffer: Buffer.from(media.data),
    contentType: media.headers["content-type"] || metadata.data.mime_type || "application/octet-stream"
  };
}

async function uploadPaymentScreenshot(userId, message) {
  const mediaId = message.image?.id;

  if (!mediaId) {
    return null;
  }

  const { buffer, contentType } = await downloadWhatsAppMedia(mediaId);
  const extension = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const path = `${userId}/${message.id}.${extension}`;

  const { error } = await supabase.storage
    .from(PAYMENT_SCREENSHOT_BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: true
    });

  if (error) {
    throw error;
  }

  return `${PAYMENT_SCREENSHOT_BUCKET}/${path}`;
}

async function persistPaymentScreenshot({ conversationId, userId, whatsappMessageId, mediaUrl, rawPayload }) {
  const { data, error } = await supabase
    .from("uploaded_images")
    .insert({
      conversation_id: conversationId,
      whatsapp_user_id: userId,
      whatsapp_message_id: whatsappMessageId,
      storage_bucket: PAYMENT_SCREENSHOT_BUCKET,
      storage_url: mediaUrl,
      image_type: "payment_screenshot",
      raw_payload: rawPayload
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await broadcastDashboardEvent("uploaded_image", data);
  return data;
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
${user.pet_type}

🩺 Problem:
${user.problem}

⏳ Duration:
${user.duration}

🌡️ Temperature:
${user.temperature}

💰 Payment:
Confirmed`;

  await sendMessage(VET_NUMBER, summary, { conversationId: user.id });
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
    case "ASK_PET":
      user = await updateConversation(user.id, {
        pet_type: message,
        state: "ASK_PROBLEM"
      });

      await sendMessage(
        userId,
        isNewUser
          ? "আসসালামু আলাইকুম 🐶🐱\n\n🩺 আপনার পোষা প্রাণীর কী সমস্যা হচ্ছে?"
          : "🩺 আপনার পোষা প্রাণীর কী সমস্যা হচ্ছে?"
      );

      break;

    case "ASK_PROBLEM":
      if (isEmergency(message)) {
        await updateConversation(user.id, {
          problem: message,
          state: "END"
        });

        await sendMessage(
          userId,
          "⚠️ এটি জরুরি সমস্যা হতে পারে। দ্রুত নিকটস্থ ভেট ক্লিনিকে যোগাযোগ করুন।",
          { conversationId: user.id }
        );

        break;
      }

      await updateConversation(user.id, {
        problem: message,
        state: "ASK_DURATION"
      });

      await sendMessage(
        userId,
        "⏳ কতদিন ধরে এই সমস্যা হচ্ছে?",
        { conversationId: user.id }
      );

      break;

    case "ASK_DURATION":
      await updateConversation(user.id, {
        duration: message,
        state: "ASK_TEMP"
      });

      await sendMessage(
        userId,
        "🌡️ শরীরের তাপমাত্রা জানা থাকলে লিখুন। না জানলে লিখুন: জানি না",
        { conversationId: user.id }
      );

      break;

    case "ASK_TEMP":
      await updateConversation(user.id, {
        temperature: message,
        state: "WAIT_PAYMENT"
      });

      await sendMessage(
        userId,
        "💰 অনলাইন কনসাল্টেশন ফি: ১০০ টাকা\n\nবিকাশ: 01721417598\n\nপেমেন্ট করে স্ক্রিনশট পাঠান।",
        { conversationId: user.id }
      );

      break;

    case "WAIT_PAYMENT":
      if (type === "image") {
        const mediaUrl = await uploadPaymentScreenshot(userId, rawMessage);

        if (user.paid) {

          console.log("Payment already confirmed, duplicate image ignored:", userId);

          break;
        }

        user.paid = true;
        user.paymentMessageId = messageId || "";

        user = await updateConversation(user.id, {
          paid: true,
          payment_screenshot_url: mediaUrl,
          state: "DOCTOR"
        });

        await sendCaseToVet(userId, user);

        await sendMessage(
          userId,
          "✅ পেমেন্ট গ্রহণ করা হয়েছে।\nডাক্তার দ্রুত রিপ্লাই করবেন।",
          { conversationId: user.id }
        );
      } else {
        await sendMessage(
          userId,
          "📸 অনুগ্রহ করে পেমেন্টের স্ক্রিনশট পাঠান।",
          { conversationId: user.id }
        );
      }

      break;

    case "DOCTOR":
      console.log("Doctor handling:", userId);
      break;

    case "END":

      console.log("Conversation already ended:", userId);

      break;

    default:
      await updateConversation(user.id, { state: "ASK_PET" });

      await sendMessage(
        userId,
        "আবার শুরু করুন 😊\nআপনার পোষা প্রাণীটি কী?",
        { conversationId: user.id }
      );
  }

  await saveUser(userId, user);
}

// ======================================================
// VERCEL HANDLER
// ======================================================

module.exports = async (req, res) => {
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

  if (req.method === "POST") {

    let message;
    let messageClaimed = false;

    try {
      ensureSupabaseConfigured();

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

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return res.sendStatus(405);
};
