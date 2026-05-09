export const dynamic = "force-dynamic";
import { getSupabaseServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = getSupabaseServerClient();
  const today = new Date(); today.setUTCHours(0,0,0,0);
  const iso = today.toISOString();
  const { data, error } = await supabase.from('bot_conversations').select('id,paid,state,created_at');
  if (error) return Response.json({ error: error.message }, { status: 400 });
  const consultationsToday = data.filter((d)=>d.created_at >= iso).length;
  const completedConsultations = data.filter((d)=>d.state === 'DOCTOR').length;
  const unpaidConsultations = data.filter((d)=>!d.paid).length;
  const revenueTotals = data.filter((d)=>d.paid).length;
  return Response.json({ data: { consultationsToday, completedConsultations, unpaidConsultations, revenueTotals } });
}
