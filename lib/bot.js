import Chat from "@/models/Chat";
import Consultation from "@/models/Consultation";
import { sendAndStoreText, sendWhatsAppText } from "@/lib/whatsapp";

const VET_NUMBER = process.env.VET_WHATSAPP_NUMBER;

export const QUICK_REPLIES = {
  payment_received: "✅ Payment received. The doctor will join this consultation shortly.",
  doctor_joining: "👩‍⚕️ A veterinarian is joining soon. Please keep your phone nearby.",
  emergency_visit: "⚠️ This may need urgent in-person care. Please visit the nearest veterinary clinic immediately.",
  consultation_completed: "✅ Consultation completed. Thank you for choosing our veterinary clinic."
};

function isEmergency(text) {
  const value = text.toLowerCase();
  return ["bleeding", "not breathing", "seizure", "collapsed", "রক্ত", "খিঁচুনি", "শ্বাস নিচ্ছে না"].some((keyword) => value.includes(keyword));
}

export async function ensureConsultation(chat) {
  let consultation = await Consultation.findOne({ chat: chat._id, status: { $in: ["open", "doctor_active", "emergency"] } }).sort({ createdAt: -1 });
  if (!consultation) {
    consultation = await Consultation.create({
      chat: chat._id,
      phone: chat.phone,
      petType: chat.petType,
      problem: chat.problem,
      duration: chat.duration,
      temperature: chat.temperature,
      paymentStatus: chat.paymentStatus,
      status: chat.consultationStatus === "emergency" ? "emergency" : "open"
    });
  }
  return consultation;
}

async function syncConsultation(chat, patch = {}) {
  const consultation = await ensureConsultation(chat);
  consultation.petType = chat.petType;
  consultation.problem = chat.problem;
  consultation.duration = chat.duration;
  consultation.temperature = chat.temperature;
  consultation.paymentStatus = chat.paymentStatus;
  Object.assign(consultation, patch);
  await consultation.save();
}

async function notifyVet(chat) {
  if (!VET_NUMBER) return;
  const summary = `🐾 New paid consultation\n\nCustomer: ${chat.phone}\nPet: ${chat.petType || "Not provided"}\nProblem: ${chat.problem || "Not provided"}\nDuration: ${chat.duration || "Not provided"}\nTemperature: ${chat.temperature || "Not provided"}\nPayment: ${chat.paymentStatus}`;
  await sendWhatsAppText(VET_NUMBER, summary);
}

export async function runBotStateMachine(chat, inboundText, inboundType, inboundMessage) {
  if (!chat.botEnabled || chat.consultationStatus === "completed") return;

  let reply = "";

  if (!chat.botState || chat.botState === "NEW") {
    chat.botState = "ASK_PET";
    chat.consultationStatus = "collecting_info";
    await chat.save();
    await syncConsultation(chat);
    await sendAndStoreText({ chat, text: "Assalamu Alaikum 🐶🐱\n\nWhat type of pet do you have?\n\n1. Cat\n2. Dog\n3. Bird\n4. Other", senderRole: "bot" });
    return;
  }

  if (chat.botState === "ASK_PET" && !chat.petType && !inboundText) {
    reply = "Assalamu Alaikum 🐶🐱\n\nWhat type of pet do you have?\n\n1. Cat\n2. Dog\n3. Bird\n4. Other";
    chat.consultationStatus = "collecting_info";
  } else {
    switch (chat.botState) {
      case "ASK_PET":
        chat.petType = inboundText;
        chat.botState = "ASK_PROBLEM";
        chat.consultationStatus = "collecting_info";
        reply = "🩺 What problem is your pet having?";
        break;
      case "ASK_PROBLEM":
        chat.problem = inboundText;
        if (isEmergency(inboundText)) {
          chat.botState = "END";
          chat.consultationStatus = "emergency";
          reply = QUICK_REPLIES.emergency_visit;
          await syncConsultation(chat, { status: "emergency" });
          break;
        }
        chat.botState = "ASK_DURATION";
        reply = "⏳ How long has this problem been happening?";
        break;
      case "ASK_DURATION":
        chat.duration = inboundText;
        chat.botState = "ASK_TEMP";
        reply = "🌡️ If you know the body temperature, please write it. If not, write: I do not know.";
        break;
      case "ASK_TEMP":
        chat.temperature = inboundText;
        chat.botState = "WAIT_PAYMENT";
        chat.consultationStatus = "awaiting_payment";
        reply = `💰 Online consultation fee: ${process.env.CONSULTATION_FEE || "100"} ${process.env.CURRENCY || "BDT"}\n\nPayment number: ${process.env.PAYMENT_NUMBER || "01721417598"}\n\nPlease send the payment screenshot here.`;
        break;
      case "WAIT_PAYMENT":
        if (inboundType === "image") {
          chat.paymentStatus = "submitted";
          chat.botState = "DOCTOR";
          chat.botEnabled = false;
          chat.consultationStatus = "doctor_active";
          await syncConsultation(chat, { status: "doctor_active", paymentStatus: "submitted", paymentMessage: inboundMessage._id });
          reply = "✅ Payment screenshot received. A doctor will reply soon.";
          await notifyVet(chat);
        } else {
          reply = "📸 Please send a screenshot/image of your payment receipt.";
        }
        break;
      case "DOCTOR":
      case "END":
        return;
      default:
        chat.botState = "ASK_PET";
        reply = "Let us start again 😊\nWhat type of pet do you have?";
        break;
    }
  }

  await chat.save();
  await syncConsultation(chat);

  if (reply) {
    await sendAndStoreText({ chat, text: reply, senderRole: "bot" });
  }
}
