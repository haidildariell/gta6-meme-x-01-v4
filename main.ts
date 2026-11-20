// Leonida Patience Bank — submission courier for gta6-meme-x-01 (v4)
// Job: take the POST.json that lives beside the bot, prove the link
// inside it really points at an X status, then hand an untouched
// copy over to the output folder.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

function shortDigest(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

const LIMIT_BYTES = 16 * 1024;

function fail(reason: string): never {
  console.error(`[patience-bank] ERROR: ${reason}`);
  process.exit(1);
}

function resolveDirs() {
  const inbox = process.env.MAKEFUN_BOT_DIR ?? "/bot";
  const outbox = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  return { inbox, outbox };
}

// An X status link comes in a few shapes. Normalise the rules into
// one expression instead of branching per host:
//   https://x.com/some_handle/status/123456
//   https://mobile.twitter.com/some_handle/status/123456
//   https://www.x.com/i/web/status/123456
const STATUS_LINK =
  /^https:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/(?:[A-Za-z0-9_]{1,15}\/status\/\d+|i\/web\/status\/\d+)(?:[/?#]\S*)?$/;

function extractStatusUrl(raw: Buffer, sourcePath: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    fail(`POST.json at ${sourcePath} is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    fail("POST.json must contain a JSON object");
  }
  const urlValue = (parsed as Record<string, unknown>)["url"];
  if (typeof urlValue !== "string" || urlValue.trim().length === 0) {
    fail('POST.json is missing a non-empty string field named "url"');
  }
  const candidate = urlValue.trim();
  if (!STATUS_LINK.test(candidate)) {
    fail(`url does not look like an X post link: ${candidate}`);
  }
  return candidate;
}

function run(): void {
  const { inbox, outbox } = resolveDirs();
  const sourcePath = join(inbox, "POST.json");
  const destPath = join(outbox, "POST.json");

  if (!existsSync(sourcePath)) {
    fail(`no POST.json found in bot directory (${sourcePath})`);
  }

  const original = readFileSync(sourcePath);
  if (original.byteLength === 0) {
    fail("POST.json is empty");
  }
  if (original.byteLength > LIMIT_BYTES) {
    fail(
      `POST.json is ${original.byteLength} bytes, over the ${LIMIT_BYTES} byte ceiling`,
    );
  }

  const link = extractStatusUrl(original, sourcePath);

  mkdirSync(outbox, { recursive: true });
  writeFileSync(destPath, original);

  const copied = readFileSync(destPath);
  if (!copied.equals(original)) {
    fail("verification failed: output copy differs from the source bytes");
  }
  const sourceHash = shortDigest(original);
  const copyHash = shortDigest(copied);
  if (sourceHash !== copyHash) {
    fail(
      `verification failed: sha256 mismatch source=${sourceHash} copy=${copyHash}`,
    );
  }

  console.log(
    `[patience-bank] ok url=${link} bytes=${copied.byteLength} sha256=${copyHash} copied=${destPath}`,
  );
}

run();
