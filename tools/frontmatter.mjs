#!/usr/bin/env node
// Edit the frontmatter (metadata block) of a .md or .txt file and nothing
// else. Meant for AI tools and scripts: the body of the file cannot be
// changed through this command. Every write is checked first and refused
// if the body would differ by even one byte.
//
//   node tools/frontmatter.mjs show  <file> [--json]
//   node tools/frontmatter.mjs get   <file> <key>
//   node tools/frontmatter.mjs set   <file> <key> <value|->   (- reads stdin)
//   node tools/frontmatter.mjs unset <file> <key>
//   node tools/frontmatter.mjs replace <file>                 (block on stdin)
//
// Add --dry-run to any write to print the result without touching the file.
// Exit codes: 0 done, 1 refused or failed, 2 bad usage.

import fs from 'node:fs';
import path from 'node:path';
import * as fm from '../src/frontmatter.mjs';

const ALLOWED = new Set(['.md', '.markdown', '.txt']);

function die(msg, code = 1) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function usage() {
  die([
    'Usage:',
    '  frontmatter.mjs show    <file> [--json]',
    '  frontmatter.mjs get     <file> <key>',
    '  frontmatter.mjs set     <file> <key> <value|->',
    '  frontmatter.mjs unset   <file> <key>',
    '  frontmatter.mjs replace <file>      (new --- block on stdin)',
    'Add --dry-run to print the result without writing.',
    'Only .md, .markdown, and .txt files. The body is never changed.',
  ].join('\n'), 2);
}

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

function load(file) {
  const ext = path.extname(file).toLowerCase();
  if (!ALLOWED.has(ext)) die(`Refused: ${file} is not a .md, .markdown, or .txt file.`);
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    die(`Cannot read ${file}: ${e.message}`);
  }
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf)) {
    die(`Refused: ${file} is not valid UTF-8, so it could not be rewritten safely.`);
  }
  return { buf, text };
}

// Last line of defense: whatever got built, the bytes after the block must
// match the original body bytes exactly.
function checkBytes(oldText, newText) {
  const oldBody = Buffer.from(fm.parse(oldText).body, 'utf8');
  const newBuf = Buffer.from(newText, 'utf8');
  const tail = newBuf.subarray(newBuf.length - oldBody.length);
  if (newBuf.length < oldBody.length || !tail.equals(oldBody)) {
    die('Refused: the body of the file would change. Nothing was written.');
  }
}

function write(file, oldText, newText, dryRun) {
  checkBytes(oldText, newText);
  if (dryRun) {
    process.stdout.write(newText);
    return;
  }
  if (newText === oldText) {
    process.stdout.write('No change.\n');
    return;
  }
  // Write beside the file, then rename over it, so a crash cannot leave a
  // half-written file.
  const mode = fs.statSync(file).mode;
  const tmp = `${file}.fm-${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, newText, { encoding: 'utf8', mode });
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    die(`Write failed: ${e.message}`);
  }
  process.stdout.write(`Updated ${file}\n`);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const asJson = args.includes('--json');
  const rest = args.filter(a => a !== '--dry-run' && a !== '--json');
  const [cmd, file, key, value] = rest;
  if (!cmd || !file) usage();

  const { text } = load(file);
  const parsed = fm.parse(text);

  try {
    if (cmd === 'show') {
      if (asJson) {
        process.stdout.write(JSON.stringify({ present: parsed.present, fields: fm.fields(parsed) }, null, 2) + '\n');
      } else if (parsed.present) {
        process.stdout.write(parsed.block);
      }
      return;
    }

    if (cmd === 'get') {
      if (!key) usage();
      const v = fm.getField(parsed, key);
      if (v === undefined) die(`No field "${key}" in ${file}.`);
      process.stdout.write(v + '\n');
      return;
    }

    if (cmd === 'set') {
      if (!key || value === undefined) usage();
      const v = value === '-' ? readStdin().replace(/\r?\n$/, '') : value;
      const base = parsed.present ? parsed : fm.emptyFor(text);
      write(file, text, fm.apply(text, fm.setField(base, key, v)).text, dryRun);
      return;
    }

    if (cmd === 'unset') {
      if (!key) usage();
      if (!parsed.present || fm.getField(parsed, key) === undefined) die(`No field "${key}" in ${file}.`);
      write(file, text, fm.apply(text, fm.removeField(parsed, key)).text, dryRun);
      return;
    }

    if (cmd === 'replace') {
      write(file, text, fm.replaceBlock(text, readStdin()).text, dryRun);
      return;
    }
  } catch (e) {
    die(e.message);
  }

  usage();
}

main();
