export const dynamic = "force-dynamic";
import { getSupabaseServerClient } from '@/lib/supabase';

export async function GET(req) {
  const id = new URL(req.url).searchParams.get('conversationId');
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', id).order('created_at');
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data });
}
