'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) return setError(signInError.message);
    router.push('/dashboard');
    router.refresh();
  }

  return <main className="min-h-screen flex items-center justify-center"><form onSubmit={handleLogin} className="card w-full max-w-md space-y-4"><h1 className="text-2xl font-semibold">Admin Login</h1><input className="w-full bg-slate-800 p-3 rounded" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} /><input type="password" className="w-full bg-slate-800 p-3 rounded" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} /><button className="w-full bg-green-600 p-3 rounded">Sign in</button>{error && <p className="text-red-400">{error}</p>}</form></main>;
}
