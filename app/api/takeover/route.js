export const dynamic = "force-dynamic";
import { getSupabaseAdminClient } from '@/lib/supabase';

export async function POST(req) {
  const { conversationId, enabled } = await req.json();
  const { data, error } = await getSupabaseAdminClient().from('bot_conversations').update({ state: enabled ? 'DOCTOR' : 'ASK_PROBLEM' }).eq('id', conversationId).select().single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data });
}
