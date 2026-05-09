import axios from 'axios';

export async function sendWhatsAppText(to, body) {
  const url = `https://graph.facebook.com/v22.0/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;
  return axios.post(url, { messaging_product: 'whatsapp', to, text: { body } }, { headers: { Authorization: `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}` } });
}
