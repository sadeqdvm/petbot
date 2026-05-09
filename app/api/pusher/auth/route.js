import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getPusherServer } from "@/lib/realtime";

export async function POST(request) {
  const session = await requireSession();
  const pusher = getPusherServer();
  if (!pusher) return NextResponse.json({ error: "Pusher is not configured" }, { status: 503 });

  const form = await request.formData();
  const socketId = form.get("socket_id");
  const channel = form.get("channel_name");
  if (!socketId || channel !== "private-clinic-dashboard") {
    return NextResponse.json({ error: "Invalid realtime auth request" }, { status: 400 });
  }

  const auth = pusher.authorizeChannel(socketId, channel, {
    user_id: String(session.sub),
    user_info: { name: session.name, role: session.role }
  });
  return NextResponse.json(auth);
}
