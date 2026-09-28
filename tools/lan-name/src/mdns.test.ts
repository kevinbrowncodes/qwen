import assert from "node:assert/strict";
import { test } from "node:test";
import { announcement, parseQuery, replyTo } from "./mdns.ts";

const NAME = "qwen.local";
const ADDRESS = "192.168.1.28";

function name(n: string): Buffer {
  return Buffer.concat([...n.split(".").map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)])), Buffer.from([0])]);
}

/** A query as a Mac sends it: id, then each question's name, type and class (the top class bit asks for unicast). */
function query(questions: { name: string; type: number; unicast?: boolean }[], id = 0): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(questions.length, 4);
  const body = questions.map((q) => {
    const tail = Buffer.alloc(4);
    tail.writeUInt16BE(q.type, 0);
    tail.writeUInt16BE(q.unicast ? 0x8001 : 1, 2);
    return Buffer.concat([name(q.name), tail]);
  });
  return Buffer.concat([header, ...body]);
}

/** The answer section's first record: type, class, ttl and data. */
function firstAnswer(message: Buffer, skipQuestions = 0): { type: number; cls: number; ttl: number; data: Buffer } {
  let offset = 12;
  const skipName = (): void => {
    while (message.readUInt8(offset) !== 0) offset += 1 + message.readUInt8(offset);
    offset += 1;
  };
  for (let i = 0; i < skipQuestions; i++) { skipName(); offset += 4; }
  skipName();
  const length = message.readUInt16BE(offset + 8);
  return {
    type: message.readUInt16BE(offset),
    cls: message.readUInt16BE(offset + 2),
    ttl: message.readUInt32BE(offset + 4),
    data: message.subarray(offset + 10, offset + 10 + length),
  };
}

void test("an A query for qwen.local is answered by multicast with the address, cache-flush set", () => {
  const parsed = parseQuery(query([{ name: NAME, type: 1 }]));
  assert.ok(parsed);
  const reply = replyTo(parsed, NAME, ADDRESS, false);
  assert.ok(reply);
  assert.equal(reply.to, "multicast");
  assert.equal(reply.message.readUInt16BE(2), 0x8400);
  assert.equal(reply.message.readUInt16BE(6), 1);
  const a = firstAnswer(reply.message);
  assert.deepEqual([a.type, a.cls, a.ttl, [...a.data].join(".")], [1, 0x8001, 120, ADDRESS]);
});

void test("the name matches without regard to case", () => {
  const parsed = parseQuery(query([{ name: "QWEN.Local", type: 255 }]));
  assert.ok(parsed);
  assert.ok(replyTo(parsed, NAME, ADDRESS, false));
});

void test("a query for any other name gets no reply", () => {
  const parsed = parseQuery(query([{ name: "spark-1.local", type: 1 }]));
  assert.ok(parsed);
  assert.equal(replyTo(parsed, NAME, ADDRESS, false), null);
});

void test("an AAAA query is told no such record by an NSEC listing only A", () => {
  const parsed = parseQuery(query([{ name: NAME, type: 28 }]));
  assert.ok(parsed);
  const reply = replyTo(parsed, NAME, ADDRESS, false);
  assert.ok(reply);
  const nsec = firstAnswer(reply.message);
  assert.equal(nsec.type, 47);
  assert.deepEqual([...nsec.data.subarray(-3)], [0, 1, 0x40]);
});

void test("a question with the unicast bit is answered to the sender", () => {
  const parsed = parseQuery(query([{ name: NAME, type: 1, unicast: true }]));
  assert.ok(parsed);
  assert.equal(replyTo(parsed, NAME, ADDRESS, false)?.to, "sender");
});

void test("a legacy resolver gets its id and question back, without cache-flush, with a 10 s TTL", () => {
  const parsed = parseQuery(query([{ name: NAME, type: 1 }], 0x1234));
  assert.ok(parsed);
  const reply = replyTo(parsed, NAME, ADDRESS, true);
  assert.ok(reply);
  assert.equal(reply.to, "sender");
  assert.equal(reply.message.readUInt16BE(0), 0x1234);
  assert.equal(reply.message.readUInt16BE(4), 1);
  const a = firstAnswer(reply.message, 1);
  assert.deepEqual([a.type, a.cls, a.ttl], [1, 1, 10]);
});

void test("a compressed second question is read through its pointer", () => {
  // Question 1: spark-1.local; question 2: qwen + a pointer to "local" inside question 1's name.
  const first = Buffer.concat([name("spark-1.local"), Buffer.from([0, 1, 0, 1])]);
  const pointer = 12 + 1 + "spark-1".length; // offset of the "local" label
  const second = Buffer.concat([Buffer.from([4]), Buffer.from("qwen"), Buffer.from([0xc0, pointer, 0, 1, 0, 1])]);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(2, 4);
  const parsed = parseQuery(Buffer.concat([header, first, second]));
  assert.deepEqual(parsed?.questions.map((q) => q.name), ["spark-1.local", NAME]);
});

void test("responses, short messages, truncated names and pointer loops are ignored", () => {
  const response = query([{ name: NAME, type: 1 }]);
  response.writeUInt16BE(0x8400, 2);
  assert.equal(parseQuery(response), null);
  assert.equal(parseQuery(Buffer.alloc(5)), null);
  assert.equal(parseQuery(query([{ name: NAME, type: 1 }]).subarray(0, 16)), null);
  const loop = Buffer.alloc(14);
  loop.writeUInt16BE(1, 4);
  loop.writeUInt16BE(0xc00c, 12); // a pointer to itself
  assert.equal(parseQuery(loop), null);
});

void test("the announcement carries the address, and the goodbye a TTL of 0", () => {
  assert.equal(firstAnswer(announcement(NAME, ADDRESS)).ttl, 120);
  assert.equal(firstAnswer(announcement(NAME, ADDRESS, 0)).ttl, 0);
  assert.equal([...firstAnswer(announcement(NAME, ADDRESS)).data].join("."), ADDRESS);
});
