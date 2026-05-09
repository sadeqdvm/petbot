const axios = require("axios");

// ======================================================
// ENV VARIABLES
// ======================================================

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// ======================================================
// TEMP USER STORAGE
// ======================================================

const users = {};

// ======================================================
// SEND WHATSAPP MESSAGE
// ======================================================

async function sendMessage(to, text) {

  try {

    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
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

    console.log("Message sent to:", to);

  } catch (error) {

    console.error(
      "SEND ERROR:",
      error.response?.data || error.message
    );
  }
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
    "খিঁচুনি",
    "শ্বাস নিচ্ছে না",
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
    temperature: ""
  };

  console.log("USER:", userId);
  console.log("STATE:", user.state);
  console.log("MESSAGE:", message);

  switch (user.state) {

    // ==================================================
    // START
    // ==================================================

    case "START":

      await sendMessage(
        userId,
        "আসসালামু আলাইকুম 🐾\n\nআপনার পোষা প্রাণী কী?\n\n১. বিড়াল\n২. কুকুর\n৩. পাখি\n৪. অন্যান্য"
      );

      user.state = "ASK_PET";

      break;

    // ==================================================
    // ASK PET
    // ==================================================

    case "ASK_PET":

      if (
        message === "১" ||
        message === "1" ||
        message.includes("বিড়াল")
      ) {

        user.petType = "Cat";

      } else if (
        message === "২" ||
        message === "2" ||
        message.includes("কুকুর")
      ) {

        user.petType = "Dog";

      } else if (
        message === "৩" ||
        message === "3" ||
        message.includes("পাখি")
      ) {

        user.petType = "Bird";

      } else {

        user.petType = "Other";
      }

      await sendMessage(
        userId,
        "🩺 কী সমস্যা হচ্ছে?"
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
          "⚠️ এটি জরুরি সমস্যা হতে পারে। দ্রুত নিকটস্থ ভেট ক্লিনিকে যোগাযোগ করুন।"
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
        "🌡️ শরীরের তাপমাত্রা জানা থাকলে লিখুন। না জানলে লিখুন: জানি না"
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
        "💰 অনলাইন কনসাল্টেশন ফি: ১০০ টাকা\n\n📱 বিকাশ: 01721417598\n\nপেমেন্ট করে স্ক্রিনশট পাঠান।"
      );

      user.state = "WAIT_PAYMENT";

      break;

    // ==================================================
    // WAIT PAYMENT
    // ==================================================

    case "WAIT_PAYMENT":

      if (type === "image") {

        await sendMessage(
          userId,
          "✅ পেমেন্ট গ্রহণ করা হয়েছে।\n\n⏱️ ৫-১০ মিনিটের মধ্যে ডাক্তার রিপ্লাই করবেন।"
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
    // DOCTOR MODE
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
        "সিস্টেম রিস্টার্ট হয়েছে। আবার লিখুন।"
      );
  }

  users[userId] = user;

  console.log("UPDATED USER:");
  console.log(users[userId]);
}

// ======================================================
// MAIN VERCEL FUNCTION
// ======================================================

module.exports = async (req, res) => {

  // ====================================================
  // WEBHOOK VERIFICATION
  // ====================================================

  if (req.method === "GET") {

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("Webhook verification request");

    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN
    ) {

      console.log("Webhook verified");

      return res.status(200).send(challenge);
    }

    return res.status(403).send("Forbidden");
  }

  // ====================================================
  // RECEIVE WEBHOOK EVENTS
  // ====================================================

  if (req.method === "POST") {

    try {

      console.log(
        JSON.stringify(req.body, null, 2)
      );

      const value =
        req.body.entry?.[0]?.changes?.[0]?.value;

      // Ignore status updates
      if (value?.statuses) {

        return res.status(200).send("OK");
      }

      const message = value?.messages?.[0];

      // Ignore empty
      if (!message) {

        return res.status(200).send("OK");
      }

      const from = message.from;
      const type = message.type;

      let text = "";

      // TEXT MESSAGE
      if (type === "text") {

        text = message.text?.body || "";
      }

      // IMAGE MESSAGE
      else if (type === "image") {

        text = "image";
      }

      // UNSUPPORTED
      else {

        return res.status(200).send("OK");
      }

      console.log("FROM:", from);
      console.log("TYPE:", type);
      console.log("TEXT:", text);

      // Respond FAST to Meta
      res.status(200).send("OK");

      // Process bot logic
      await handleMessage(from, text, type);

      return;

    } catch (error) {

      console.error(
        "WEBHOOK ERROR:",
        error.response?.data || error.message
      );

      return res.status(500).send("Server Error");
    }
  }

  // ====================================================
  // INVALID METHOD
  // ====================================================

  return res.status(405).send("Method Not Allowed");
};