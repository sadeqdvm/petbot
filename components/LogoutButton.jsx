'use client';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase';

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await getSupabaseBrowserClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return <button onClick={logout} className="ml-auto bg-slate-700 px-3 py-1 rounded">Logout</button>;
}
