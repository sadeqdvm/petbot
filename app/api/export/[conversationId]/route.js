import { getSupabaseServerClient } from '@/lib/supabase';

export async function GET(_, { params }) {
  const { data } = await getSupabaseServerClient().from('messages').select('*').eq('conversation_id', params.conversationId).order('created_at');
  const lines = data.map((m) => `[${m.created_at}] ${m.direction}: ${m.body}`).join('\n');
  return new Response(lines, { headers: { 'Content-Type': 'text/plain', 'Content-Disposition': `attachment; filename="conversation-${params.conversationId}.txt"` } });
}
