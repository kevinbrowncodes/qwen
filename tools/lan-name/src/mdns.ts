// tools/lan-name/src/mdns.ts (CHORE_004): the mDNS messages that make one name resolve to one IPv4 address. Pure: it
// reads a query and builds the reply, and main.ts does the sockets. Only what a resolver needs is implemented: A
// answers, an NSEC saying no other record type exists (so a Mac's AAAA lookup is told "none" instead of waiting), a
// legacy unicast reply for resolvers that ask from a port other than 5353, and a goodbye with TTL 0.

export const MDNS_PORT = 5353;
export const MDNS_GROUP = "224.0.0.251";

const TYPE_A = 1;
const TYPE_NSEC = 47;
const TYPE_ANY = 255;
const CLASS_IN = 1;
const CACHE_FLUSH = 0x8000;
const UNICAST_RESPONSE = 0x8000;
const TTL = 120;
const LEGACY_TTL = 10; // RFC 6762 §6.7: at most 10 s in a reply to a one-shot resolver

export interface Question {
  name: string;
  type: number;
  unicast: boolean;
}

export interface Query {
  id: number;
  questions: Question[];
}

/** The questions in a query, or null for a response or anything that is not a well-formed message. */
export function parseQuery(message: Buffer): Query | null {
  if (message.length < 12) return null;
  const flags = message.readUInt16BE(2);
  if (flags & 0x8000) return null; // a response, not a query
  const count = message.readUInt16BE(4);
  const questions: Question[] = [];
  let offset = 12;
  for (let i = 0; i < count; i++) {
    const read = readName(message, offset);
    if (!read || read.end + 4 > message.length) return null;
    const qclass = message.readUInt16BE(read.end + 2);
    questions.push({ name: read.name, type: message.readUInt16BE(read.end), unicast: (qclass & UNICAST_RESPONSE) !== 0 });
    offset = read.end + 4;
  }
  return { id: message.readUInt16BE(0), questions };
}

/** A name at offset, following compression pointers (with a hop limit, so a pointer loop cannot hang the reader). */
function readName(message: Buffer, start: number): { name: string; end: number } | null {
  const labels: string[] = [];
  let offset = start;
  let end: number | null = null;
  for (let hops = 0; hops < 32; hops++) {
    if (offset >= message.length) return null;
    const length = message.readUInt8(offset);
    if (length === 0) return { name: labels.join("."), end: end ?? offset + 1 };
    if ((length & 0xc0) === 0xc0) {
      if (offset + 1 >= message.length) return null;
      end ??= offset + 2;
      offset = message.readUInt16BE(offset) & 0x3fff;
      continue;
    }
    if (offset + 1 + length > message.length) return null;
    labels.push(message.toString("utf8", offset + 1, offset + 1 + length));
    offset += 1 + length;
  }
  return null;
}

function encodeName(name: string): Buffer {
  const parts = name.split(".").map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)]));
  return Buffer.concat([...parts, Buffer.from([0])]);
}

function record(name: string, type: number, cls: number, ttl: number, data: Buffer): Buffer {
  const fixed = Buffer.alloc(10);
  fixed.writeUInt16BE(type, 0);
  fixed.writeUInt16BE(cls, 2);
  fixed.writeUInt32BE(ttl, 4);
  fixed.writeUInt16BE(data.length, 8);
  return Buffer.concat([encodeName(name), fixed, data]);
}

function aRecord(name: string, address: string, cls: number, ttl: number): Buffer {
  return record(name, TYPE_A, cls, ttl, Buffer.from(address.split(".").map(Number)));
}

/** NSEC for our own name, listing A as the only type that exists (RFC 6762 §6.1). */
function nsecRecord(name: string, cls: number, ttl: number): Buffer {
  return record(name, TYPE_NSEC, cls, ttl, Buffer.concat([encodeName(name), Buffer.from([0, 1, 0x40])]));
}

function message(id: number, questions: Buffer[], answers: Buffer[], additionals: Buffer[]): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x8400, 2); // a response, authoritative
  header.writeUInt16BE(questions.length, 4);
  header.writeUInt16BE(answers.length, 6);
  header.writeUInt16BE(additionals.length, 10);
  return Buffer.concat([header, ...questions, ...answers, ...additionals]);
}

export type Reply = { to: "multicast" | "sender"; message: Buffer };

/**
 * The reply to a query for `name`, or null when the query does not ask about it. `legacy` is a query sent from a port
 * other than 5353: it gets a unicast reply that echoes the id and question, with no cache-flush bit and a short TTL.
 */
export function replyTo(query: Query, name: string, address: string, legacy: boolean): Reply | null {
  const ours = query.questions.filter((q) => q.name.toLowerCase() === name.toLowerCase());
  if (ours.length === 0) return null;
  const wantsA = ours.some((q) => q.type === TYPE_A || q.type === TYPE_ANY);
  const cls = legacy ? CLASS_IN : CLASS_IN | CACHE_FLUSH;
  const ttl = legacy ? LEGACY_TTL : TTL;
  const a = aRecord(name, address, cls, ttl);
  const nsec = nsecRecord(name, cls, ttl);
  const answers = wantsA ? [a] : [nsec];
  const additionals = wantsA ? [nsec] : [a];
  if (legacy) {
    const question = Buffer.concat([encodeName(name), Buffer.from([0, ours[0]?.type ?? TYPE_A, 0, CLASS_IN])]);
    return { to: "sender", message: message(query.id, [question], answers, additionals) };
  }
  return { to: ours.every((q) => q.unicast) ? "sender" : "multicast", message: message(0, [], answers, additionals) };
}

/** The unsolicited announcement sent at start (RFC 6762 §8.3), or with ttl 0, the goodbye sent at stop. */
export function announcement(name: string, address: string, ttl = TTL): Buffer {
  return message(0, [], [aRecord(name, address, CLASS_IN | CACHE_FLUSH, ttl)], []);
}
