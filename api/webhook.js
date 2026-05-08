const axios = require("axios");

// ======================================================
// ENV VARIABLES
// ======================================================

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Vet/Admin number
// Format WITHOUT "+"
const VET_NUMBER = "8801721417598";

// ======================================================
// TEMP MEMORY STORAGE (MVP)
// Later replace with MongoDB/Firebase
// ======================================================

const users = {};

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

      // Image = payment screenshot
      if (type === "image") {

        user.paid = true;

        // Send summary to vet
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
    // DOCTOR HANDOVER
    // ==================================================

    case "DOCTOR":

      console.log(`Doctor takeover active for ${userId}`);

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

  // Save state
  users[userId] = user;

  console.log("UPDATED USER:");
  console.log(users[userId]);
}

// ======================================================
// MAIN VERCEL HANDLER
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

    console.log("Webhook verification failed");

    return res.sendStatus(403);
  }

  // ====================================================
  // RECEIVE WEBHOOK EVENTS
  // ====================================================

  if (req.method === "POST") {

    try {

      console.log(
        "Incoming Webhook:",
        JSON.stringify(req.body, null, 2)
      );

      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // ================================================
      // IGNORE STATUS EVENTS
      // ================================================

      if (value?.statuses) {

        console.log("Ignoring status event");

        return res.sendStatus(200);
      }

      // ================================================
      // IGNORE EMPTY EVENTS
      // ================================================

      if (!value?.messages) {

        console.log("No messages found");

        return res.sendStatus(200);
      }

      const message = value.messages[0];

      // ================================================
      // IGNORE INVALID EVENTS
      // ================================================

      if (!message || !message.from) {

        console.log("Invalid message");

        return res.sendStatus(200);
      }

      const from = message.from;

      // ================================================
      // IGNORE VET/ADMIN MESSAGES
      // Prevent infinite loop
      // ================================================

      if (from === VET_NUMBER) {

        console.log("Ignoring vet/admin message");

        return res.sendStatus(200);
      }

      const type = message.type;

      let text = "";

      // ================================================
      // TEXT MESSAGE
      // ================================================

      if (type === "text") {

        text = message.text?.body || "";
      }

      // ================================================
      // IMAGE MESSAGE
      // ================================================

      else if (type === "image") {

        text = "image";
      }

      // ================================================
      // UNSUPPORTED MESSAGE
      // ================================================

      else {

        console.log("Unsupported message type");

        return res.sendStatus(200);
      }

      console.log("================================");
      console.log("FROM:", from);
      console.log("TYPE:", type);
      console.log("TEXT:", text);
      console.log("================================");

      // Process bot logic
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

  // ====================================================
  // METHOD NOT ALLOWED
  // ====================================================

  return res.sendStatus(405);
};