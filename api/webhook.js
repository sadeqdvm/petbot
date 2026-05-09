require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

// ========================================
// ENV
// ========================================

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// ========================================
// TEMP MEMORY
// ========================================

const users = {};

// ========================================
// VERIFY WEBHOOK
// ========================================

app.get("/", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("VERIFY REQUEST");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {

    console.log("WEBHOOK VERIFIED");

    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ========================================
// RECEIVE MESSAGES
// ========================================

app.post("/", async (req, res) => {

  try {

    console.log(
      "WEBHOOK:",
      JSON.stringify(req.body, null, 2)
    );

    const message =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    // Prevent duplicate replies
    if (message.id && users[message.id]) {
      return res.sendStatus(200);
    }

    users[message.id] = true;

    const from = message.from;
    const type = message.type;

    let text = "";

    if (type === "text") {
      text = message.text?.body || "";
    }

    console.log("FROM:", from);
    console.log("TEXT:", text);

    await sendMessage(
      from,
      "Bot is working ✅"
    );

    return res.sendStatus(200);

  } catch (err) {

    console.error(
      "ERROR:",
      err.response?.data || err.message
    );

    return res.sendStatus(500);
  }
});

// ========================================
// SEND MESSAGE
// ========================================

async function sendMessage(to, text) {

  try {

    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
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

    console.log("MESSAGE SENT");

  } catch (err) {

    console.error(
      "SEND ERROR:",
      err.response?.data || err.message
    );
  }
}

// ========================================
// EXPORT
// ========================================

module.exports = app;