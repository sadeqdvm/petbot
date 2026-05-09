import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import User from "@/models/User";

export async function POST() {
  const session = await getSession();
  if (session?.sub) {
    await connectDb();
    await User.findByIdAndUpdate(session.sub, { online: false, lastSeenAt: new Date() });
  }
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
