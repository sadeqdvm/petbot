import { getSupabaseServerClient } from '@/lib/supabase';
export async function GET(){ const {data}=await getSupabaseServerClient().from('consultations').select('*').order('created_at',{ascending:false}); return Response.json({data}); }
export async function POST(req){ const payload=await req.json(); const {data,error}=await getSupabaseServerClient().from('consultations').upsert(payload).select().single(); if(error) return Response.json({error:error.message},{status:400}); return Response.json({data}); }
