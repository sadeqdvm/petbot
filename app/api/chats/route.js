export const dynamic = "force-dynamic";
import { getSupabaseServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('bot_conversations')
    .select('id,whatsapp_user_id,state,updated_at,messages(body,direction,created_at)')
    .order('updated_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  const chats = (data || []).map((c) => {
    const sorted = [...(c.messages || [])].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    const last = sorted[sorted.length - 1];
    const unreadCount = (c.messages || []).filter((m) => m.direction === 'inbound').length;
    return { id: c.id, phone: c.whatsapp_user_id, state: c.state, updated_at: c.updated_at, last_message: last?.body || '', unread_count: unreadCount };
  });
  return Response.json({ data: chats });
}
