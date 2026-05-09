import { sendWhatsAppText } from '@/lib/whatsapp';
import { getSupabaseServerClient } from '@/lib/supabase';

export async function POST(req) {
  const { to, body, conversationId } = await req.json();
  const response = await sendWhatsAppText(to, body);
  await getSupabaseServerClient().from('messages').insert({ conversation_id: conversationId, wa_id: to, body, direction: 'out' });
  return Response.json({ sent: true, provider: response.data });
}
