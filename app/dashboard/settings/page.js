'use client';
import { useState } from 'react';
export default function SettingsPage(){ const [dark,setDark]=useState(true); return <div className="card"><label className="flex items-center gap-2"><input type="checkbox" checked={dark} onChange={()=>setDark(!dark)} />Dark mode</label></div>; }
