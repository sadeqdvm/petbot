import { getSupabaseServerClient } from '@/lib/supabase';
export async function GET(req){ const q = new URL(req.url).searchParams.get('q') || ''; const {data} = await getSupabaseServerClient().from('conversations').select('*').ilike('customer_name', `%${q}%`).limit(30); return Response.json({data}); }
