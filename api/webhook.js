const axios = require("axios");

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// ======================================================
// SEND MESSAGE
// ======================================================

async function sendMessage(to, text) {

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
}

// ======================================================
// MAIN HANDLER
// ======================================================

module.exports = async (req, res) => {

  // ====================================================
  // VERIFY WEBHOOK
  // ====================================================

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

  // ====================================================
  // RECEIVE MESSAGE
  // ====================================================

  if (req.method === "POST") {

    try {

      console.log(
        JSON.stringify(req.body, null, 2)
      );

      const value =
        req.body.entry?.[0]?.changes?.[0]?.value;

      // Ignore statuses
      if (value?.statuses) {
        return res.sendStatus(200);
      }

      const message = value?.messages?.[0];

      if (!message) {
        return res.sendStatus(200);
      }

      const from = message.from;

      let text = "";

      if (message.type === "text") {
        text = message.text?.body || "";
      }

      console.log("FROM:", from);
      console.log("TEXT:", text);

      // Reply immediately to Meta
      res.sendStatus(200);

      // Simple bot reply
      await sendMessage(
        from,
        `আপনি লিখেছেন: ${text}`
      );

      return;

    } catch (error) {

      console.error(
        error.response?.data || error.message
      );

      return res.sendStatus(500);
    }
  }

  return res.sendStatus(405);
};