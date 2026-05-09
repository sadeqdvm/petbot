export async function isDuplicateMessage(supabase, messageId) {
  const { data } = await supabase.from('messages').select('id').eq('meta_message_id', messageId).maybeSingle();
  return Boolean(data);
}
