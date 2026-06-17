import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { runVerifier } from "./verifiers.js";

function tempWorld(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "world-verify-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(dir, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
  return dir;
}

test("command verifier passes when SUBMIT_ANSWER matches", async () => {
  const result = await runVerifier(
    { type: "command", cmd: 'test "$SUBMIT_ANSWER" = "golden"' },
    { worldRoot: "/tmp", answer: "golden" },
  );
  assert.equal(result.ok, true);
  assert.match(result.message, /passed/i);
});

test("command verifier fails when SUBMIT_ANSWER mismatches", async () => {
  const result = await runVerifier(
    { type: "command", cmd: 'test "$SUBMIT_ANSWER" = "golden"' },
    { worldRoot: "/tmp", answer: "wrong" },
  );
  assert.equal(result.ok, false);
});

test("fileContains verifier passes when expected substring is present", async () => {
  const worldRoot = tempWorld({ "greeting/hello.txt": "bench-ok\n" });
  const result = await runVerifier(
    {
      type: "fileContains",
      path: "greeting/hello.txt",
      expected: "bench-ok",
    },
    { worldRoot },
  );
  assert.equal(result.ok, true);
  assert.match(result.message, /contains expected/i);
});

test("fileContains verifier fails when expected substring is missing", async () => {
  const worldRoot = tempWorld({ "greeting/hello.txt": "not-it\n" });
  const result = await runVerifier(
    {
      type: "fileContains",
      path: "greeting/hello.txt",
      expected: "bench-ok",
    },
    { worldRoot },
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /not found/i);
});

test("jsonMatch verifier accepts numeric string answer", async () => {
  const result = await runVerifier(
    { type: "jsonMatch", expected: { answer: 42 } },
    { worldRoot: "/tmp", answer: "42" },
  );
  assert.equal(result.ok, true);
  assert.match(result.message, /json match passed/i);
});

test("jsonMatch verifier accepts JSON object answer", async () => {
  const result = await runVerifier(
    { type: "jsonMatch", expected: { answer: "FLAG{world-hop-benchmark}" } },
    { worldRoot: "/tmp", answer: '{"answer":"FLAG{world-hop-benchmark}"}' },
  );
  assert.equal(result.ok, true);
});

test("jsonMatch verifier fails on wrong answer", async () => {
  const result = await runVerifier(
    { type: "jsonMatch", expected: { answer: 42 } },
    { worldRoot: "/tmp", answer: "99" },
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /expected answer=42/i);
});

test("jsonMatch verifier fails when answer is missing", async () => {
  const result = await runVerifier(
    { type: "jsonMatch", expected: { answer: 42 } },
    { worldRoot: "/tmp" },
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /submit answer required/i);
});
