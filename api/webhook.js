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
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PAYMENT_SCREENSHOT_BUCKET = process.env.PAYMENT_SCREENSHOT_BUCKET || "payment-screenshots";
const VET_NUMBER = process.env.VET_NUMBER || "8801721417598";
const INBOUND_PROCESSING_STALE_SECONDS = Number(process.env.INBOUND_PROCESSING_STALE_SECONDS || 300);

const processedMessages = new Set();
const inFlightMessages = new Set();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(SUPABASE_URL || "http://localhost:54321", SUPABASE_SERVICE_ROLE_KEY || "missing", {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

function getSupabaseUserClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function requireSupabaseUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { user: null, client: null };
  }

  const client = getSupabaseUserClient(token);
  const { data, error } = await client.auth.getUser(token);

  if (error) {
    console.error("SUPABASE AUTH ERROR:", error.message);
    return { user: null, client: null };
  }

  return { user: data.user, client };
}

function ensureSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
}


function rememberProcessedMessage(messageId) {
  if (!messageId) {
    return;
  }

  processedMessages.add(messageId);

  setTimeout(() => {
    processedMessages.delete(messageId);
  }, 60000);
}

async function beginInboundMessageProcessing(message) {
  const messageId = message.id;

  if (!messageId) {
    return true;
  }

  if (processedMessages.has(messageId) || inFlightMessages.has(messageId)) {
    return false;
  }

  inFlightMessages.add(messageId);

  const { data, error } = await supabase.rpc("claim_inbound_message", {
    p_message_id: messageId,
    p_user_id: message.from,
    p_message_type: message.type,
    p_message_text: message.text?.body || null,
    p_payload: message,
    p_stale_after_seconds: INBOUND_PROCESSING_STALE_SECONDS
  });

  if (error) {
    inFlightMessages.delete(messageId);
    throw error;
  }

  if (!data) {
    inFlightMessages.delete(messageId);
    console.log("Duplicate or active message ignored:", messageId);
    return false;
  }

  return true;
}

async function markInboundMessageProcessed(messageId) {
  if (!messageId) {
    return;
  }

  inFlightMessages.delete(messageId);
  rememberProcessedMessage(messageId);

  const { error } = await supabase.rpc("complete_inbound_message", {
    p_message_id: messageId
  });

  if (error) {
    console.error("SUPABASE MESSAGE COMPLETE ERROR:", error.message);
  }
}

async function markInboundMessageFailed(messageId, error) {
  if (!messageId) {
    return;
  }

  inFlightMessages.delete(messageId);
  processedMessages.delete(messageId);

  const { error: failError } = await supabase.rpc("fail_inbound_message", {
    p_message_id: messageId,
    p_last_error: String(error?.message || error).slice(0, 1000)
  });

  if (failError) {
    console.error("SUPABASE MESSAGE FAIL ERROR:", failError.message);
  }
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

async function createVetCase(userId, user) {
  const { error } = await supabase
    .from("vet_cases")
    .insert({
      conversation_id: user.id || null,
      whatsapp_user_id: userId,
      pet_type: user.pet_type || null,
      problem: user.problem || null,
      duration: user.duration || null,
      temperature: user.temperature || null,
      payment_confirmed: Boolean(user.paid),
      status: "sent_to_vet"
    });

  if (error) {
    console.error("SUPABASE CASE ERROR:", error.message);
  }
}

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

async function handleMessage(userId, message, type, rawMessage) {
  let user = await getConversation(userId);

  if (!user) {
    user = await createConversation(userId);

    await sendMessage(
      userId,
      "আসসালামু আলাইকুম 🐶🐱\n\nআপনার পোষা প্রাণীটি কী?\n\n১. বিড়াল\n২. কুকুর\n৩. পাখি\n৪. অন্যান্য",
      { conversationId: user.id }
    );

    return;
  }

  console.log("================================");
  console.log("USER:", userId);
  console.log("STATE:", user.state);
  console.log("MESSAGE:", message);
  console.log("TYPE:", type);
  console.log("================================");

  switch (user.state) {
    case "ASK_PET":
      user = await updateConversation(user.id, {
        pet_type: message,
        state: "ASK_PROBLEM"
      });

      await sendMessage(
        userId,
        "🩺 আপনার পোষা প্রাণীর কী সমস্যা হচ্ছে?",
        { conversationId: user.id }
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

        await persistPaymentScreenshot({
          conversationId: user.id,
          userId,
          whatsappMessageId: rawMessage.id,
          mediaUrl,
          rawPayload: rawMessage
        });

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
      await sendMessage(
        userId,
        "ধন্যবাদ ❤️",
        { conversationId: user.id }
      );
      break;

    default:
      await updateConversation(user.id, { state: "ASK_PET" });

      await sendMessage(
        userId,
        "আবার শুরু করুন 😊\nআপনার পোষা প্রাণীটি কী?",
        { conversationId: user.id }
      );
  }
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

      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value?.messages) {
        return res.sendStatus(200);
      }

      message = value.messages[0];

      if (message.from_me) {
        return res.sendStatus(200);
      }

      messageClaimed = await beginInboundMessageProcessing(message);

      if (!messageClaimed) {
        return res.sendStatus(200);
      }

      const messageId = message.id;
      const from = message.from;
      const type = message.type;
      let text = "";
      let mediaUrl = null;

      if (type === "text") {
        text = message.text?.body || "";
      }

      console.log("FROM:", from);
      console.log("TYPE:", type);
      console.log("TEXT:", text);

      const conversation = await getConversation(from);

      await recordMessage({
        whatsappMessageId: messageId,
        conversationId: conversation?.id || null,
        userId: from,
        direction: "inbound",
        type,
        body: text,
        rawPayload: message,
        mediaUrl
      });

      await handleMessage(from, text, type, message);
      await markInboundMessageProcessed(messageId);

      return res.sendStatus(200);
    } catch (error) {
      if (messageClaimed) {
        await markInboundMessageFailed(message?.id, error);
      }

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

module.exports.requireSupabaseUser = requireSupabaseUser;
module.exports.getSupabaseUserClient = getSupabaseUserClient;
