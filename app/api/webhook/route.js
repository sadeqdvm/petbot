export const dynamic = "force-dynamic";
import { getSupabaseAdminClient } from '@/lib/supabase';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.verify_token') === process.env.META_WHATSAPP_VERIFY_TOKEN) return new Response(searchParams.get('hub.challenge'));
  return Response.json({ error: 'Invalid verify token' }, { status: 403 });
}

export async function POST(req) {
  const payload = await req.json();
  const supabase = getSupabaseAdminClient();
  const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return Response.json({ ok: true });

  const { data: claimed } = await supabase.rpc('claim_inbound_message', {
    p_message_id: message.id,
    p_user_id: message.from,
    p_message_type: message.type || 'text',
    p_message_text: message.text?.body || '',
    p_payload: message
  });
  if (!claimed) return Response.json({ deduped: true });

  const { data: conversation } = await supabase.from('bot_conversations').upsert({ whatsapp_user_id: message.from }, { onConflict: 'whatsapp_user_id' }).select().single();
  await supabase.from('messages').insert({ whatsapp_message_id: message.id, conversation_id: conversation.id, whatsapp_user_id: message.from, direction: 'inbound', message_type: message.type || 'text', body: message.text?.body || '', raw_payload: message });
  await supabase.rpc('complete_inbound_message', { p_message_id: message.id });
  return Response.json({ ok: true });
}
