import { sendWhatsAppText } from '@/lib/whatsapp';
import { getSupabaseAdminClient } from '@/lib/supabase';

export async function POST(req) {
  const { to, body, conversationId } = await req.json();
  const response = await sendWhatsAppText(to, body);
  const supabase = getSupabaseAdminClient();
  await supabase.from('messages').insert({ conversation_id: conversationId, whatsapp_user_id: to, body, direction: 'outbound', raw_payload: response.data });
  await supabase.from('bot_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  return Response.json({ sent: true, provider: response.data });
}
