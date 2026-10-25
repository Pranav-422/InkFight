"use client";

// Fallback link for when WebRTC can't connect (Wi-Fi client isolation, carrier NAT): both browsers join a
// Supabase Realtime broadcast channel and pass the same JSON strings the data channels would. It's slower
// than a direct link, so the host sends fewer snapshots over it (RELAY_SNAP_EVERY in useGameRoom.ts).
// The topic carries an HMAC only the server can make (relayKey in src/lib/rooms.ts), so only this room's
// two players can find it.
// shortcut: a public channel, so anyone with the publishable key can spend the project's message quota;
// switch to private channels + a server-signed JWT if that ever happens.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const relayConfigured = Boolean(URL && KEY);

const PING_MS = 2000; // keepalive when idle; it also tells the other side we're here
const SILENT_MS = 10000; // nothing heard for this long = the other side is gone

export type Relay = { up: boolean; send(data: string): void; close(): void };

// up turns true (and onOpen fires) once the other player is heard on the channel.
// onClose fires once, when an up link goes silent.
export async function openRelay(topic: string, onOpen: () => void, onMessage: (data: string) => void, onClose: () => void): Promise<Relay> {
  const { RealtimeClient } = await import("@supabase/realtime-js");
  const client = new RealtimeClient(`${URL}/realtime/v1`, { params: { apikey: KEY } });
  const ch = client.channel(topic, { config: { broadcast: { self: false } } });
  let subscribed = false, closed = false, heard = 0, sent = 0;
  const push = (payload: { d?: string }) => {
    if (!subscribed || closed) return;
    sent = Date.now();
    void ch.send({ type: "broadcast", event: "m", payload });
  };
  const relay: Relay = {
    up: false,
    send: (d) => push({ d }),
    close() {
      if (closed) return;
      closed = true;
      relay.up = false;
      clearInterval(beat);
      void client.removeChannel(ch).finally(() => client.disconnect());
    },
  };
  ch.on("broadcast", { event: "m" }, ({ payload }) => {
    if (closed) return;
    heard = Date.now();
    if (!relay.up) {
      relay.up = true;
      onOpen();
    }
    if (typeof payload?.d === "string") onMessage(payload.d); // no d = a ping
  });
  // Ping every second until the other side answers, then only when idle.
  const beat = setInterval(() => {
    const now = Date.now();
    if (relay.up && now - heard > SILENT_MS) {
      relay.close();
      return onClose();
    }
    if (!relay.up || now - sent > PING_MS) push({});
  }, 1000);
  ch.subscribe((status, err) => {
    if (status === "SUBSCRIBED") subscribed = true;
    else if (status !== "CLOSED") console.warn("[relay]", status, err?.message ?? "");
  });
  return relay;
}
