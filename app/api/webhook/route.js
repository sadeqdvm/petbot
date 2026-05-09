import { getSupabaseServerClient } from '@/lib/supabase';
import { isDuplicateMessage } from '@/utils/dedupe';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.verify_token') === process.env.META_WHATSAPP_VERIFY_TOKEN) {
    return new Response(searchParams.get('hub.challenge'));
  }
  return Response.json({ error: 'Invalid verify token' }, { status: 403 });
}

export async function POST(req) {
  const payload = await req.json();
  const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return Response.json({ ok: true });
  const supabase = getSupabaseServerClient();
  if (await isDuplicateMessage(supabase, message.id)) return Response.json({ deduped: true });
  await supabase.from('messages').insert({
    meta_message_id: message.id,
    wa_id: message.from,
    body: message.text?.body || '[non-text]',
    direction: 'in'
  });
  return Response.json({ ok: true });
}
