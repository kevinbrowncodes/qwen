// tools/lan-name/src/main.ts (CHORE_004): answer mDNS queries for LAN_NAME (qwen.local) with this host's LAN address.
// It runs with host networking beside the host's avahi-daemon, sharing port 5353 (both set SO_REUSEADDR), and answers
// only for its own name. The address is the one the host routes through, re-read every minute. If it changes, the
// process exits and Docker's restart policy starts it again on the new interface.
import dgram from "node:dgram";
import { MDNS_GROUP, MDNS_PORT, announcement, parseQuery, replyTo } from "./mdns.ts";

const NAME = process.env.LAN_NAME ?? "qwen.local";
const CHECK_MS = 60_000;

/** The source address the host would use to reach the internet: a connected UDP socket sends nothing to learn it. */
function lanAddress(): Promise<string> {
  return new Promise((resolve, reject) => {
    const probe = dgram.createSocket("udp4");
    probe.on("error", reject);
    probe.connect(53, "1.1.1.1", () => {
      const { address } = probe.address();
      probe.close();
      resolve(address);
    });
  });
}

async function main(): Promise<void> {
  const address = await lanAddress();
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const send = (message: Buffer, port = MDNS_PORT, host = MDNS_GROUP): void => {
    socket.send(message, port, host);
  };

  socket.on("message", (message, from) => {
    const query = parseQuery(message);
    if (!query) return;
    const reply = replyTo(query, NAME, address, from.port !== MDNS_PORT);
    if (!reply) return;
    if (reply.to === "sender") send(reply.message, from.port, from.address);
    else send(reply.message);
  });

  await new Promise<void>((resolve) => socket.bind(MDNS_PORT, "0.0.0.0", resolve));
  socket.addMembership(MDNS_GROUP, address);
  socket.setMulticastInterface(address);
  socket.setMulticastTTL(255);
  send(announcement(NAME, address));
  setTimeout(() => { send(announcement(NAME, address)); }, 1000);
  console.log(`[lan-name] answering for ${NAME} -> ${address}`);

  setInterval(() => {
    void lanAddress().then((now) => {
      if (now === address) return;
      console.log(`[lan-name] the address changed to ${now}; restarting`);
      send(announcement(NAME, address, 0));
      setTimeout(() => process.exit(1), 200);
    }, () => undefined);
  }, CHECK_MS);

  const stop = (): void => {
    send(announcement(NAME, address, 0)); // goodbye: caches drop the name now rather than in two minutes
    setTimeout(() => process.exit(0), 200);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((error: unknown) => {
  console.error("[lan-name]", error);
  process.exit(1);
});
