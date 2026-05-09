import Pusher from "pusher";

let pusher;

export function getPusherServer() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) return null;

  if (!pusher) {
    pusher = new Pusher({ appId, key, secret, cluster, useTLS: true });
  }

  return pusher;
}

export async function publishDashboardEvent(event, payload) {
  const client = getPusherServer();
  if (!client) return;
  await client.trigger("private-clinic-dashboard", event, payload);
}
