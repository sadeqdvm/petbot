'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    if (!email || !password) return setError('Email and password are required.');
    document.cookie = 'sb-access-token=local-dev-token; path=/';
    router.push('/dashboard');
  }

  return <main className="min-h-screen flex items-center justify-center"><form onSubmit={handleLogin} className="card w-full max-w-md space-y-4"><h1 className="text-2xl font-semibold">Admin Login</h1><input className="w-full bg-slate-800 p-3 rounded" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} /><input type="password" className="w-full bg-slate-800 p-3 rounded" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} /><button className="w-full bg-green-600 p-3 rounded">Sign in</button>{error && <p className="text-red-400">{error}</p>}</form></main>;
}
