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
// Whole-folder mode, for adding metadata to many notes at once:
//
//   node tools/frontmatter.mjs inventory <folder> [--preview N]
//       Lists every note as JSON: path, size, existing metadata, first
//       heading, and the first N characters of the body (default 500).
//   node tools/frontmatter.mjs apply <folder> <plan.json> --out <newfolder>
//       Copies the folder to <newfolder> and adds the metadata in the plan to
//       the copies. The original folder is never modified. The plan maps a
//       note's path to its fields:
//         { "notes/a.md": { "title": "A", "summary": "...",
//                           "tags": ["x", "y"], "related": ["Other Note"] } }
//       Fields a note already has are kept unless --overwrite is given.
//       "related" names must match a note in the folder; others are dropped
//       and reported. --dry-run reports what would change and writes nothing.
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
    '  frontmatter.mjs inventory <folder> [--preview N]',
    '  frontmatter.mjs apply <folder> <plan.json> --out <newfolder> [--overwrite] [--dry-run]',
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

// ---- Whole-folder mode ----

function takeOpt(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, v === undefined ? 1 : 2);
  return v;
}

function walkNotes(root) {
  const found = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && ALLOWED.has(path.extname(e.name).toLowerCase())) found.push(p);
    }
  })(root);
  return found.sort();
}

const relPath = (root, p) => path.relative(root, p).split(path.sep).join('/');

// Same checks as load(), but reports instead of exiting so one bad note
// does not stop a whole folder.
function readNote(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    return { error: e.message };
  }
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf)) return { error: 'not valid UTF-8, left untouched' };
  return { text };
}

function inventory(folder, previewChars) {
  const notes = walkNotes(folder).map(p => {
    const r = readNote(p);
    const rel = relPath(folder, p);
    if (r.error) return { path: rel, error: r.error };
    const parsed = fm.parse(r.text);
    const heading = (/^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(parsed.body) || [])[1] || null;
    return {
      path: rel,
      bytes: Buffer.byteLength(r.text, 'utf8'),
      hasFrontmatter: parsed.present,
      fields: Object.fromEntries(fm.fields(parsed).map(f => [f.key, f.value])),
      heading,
      preview: parsed.body.trim().slice(0, previewChars),
    };
  });
  return { folder, count: notes.length, notes };
}

const RESERVED = /^(true|false|null|yes|no|on|off|~|[-+]?[0-9][0-9._]*)$/i;
const LINK_KEYS = new Set(['related', 'links', 'parent']);

// One-line YAML text value: plain when that is safe, otherwise double quoted.
function yamlText(value) {
  const t = String(value).replace(/\s+/g, ' ').trim();
  const plain = /^[A-Za-z0-9_][^:#\[\]{}&*!|>'"%@`,]*$/.test(t)
    && !/: |\s#/.test(t) && !/[:\s]$/.test(t) && !RESERVED.test(t);
  return plain ? t : JSON.stringify(t);
}

function tagText(tag) {
  return String(tag).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_/-]/gu, '');
}

// Value text for setField(). Lists of link names are "- item" lines (names
// may contain commas and spaces); other lists are [a, b].
function fieldValue(key, raw) {
  if (Array.isArray(raw)) {
    const items = raw.map(x => (key === 'tags' ? tagText(x) : String(x).trim())).filter(Boolean);
    // Link names match without regard to case, so "Compost" and "compost"
    // are the same note and are listed once.
    const seen = new Set();
    const unique = items.filter(x => {
      const k = LINK_KEYS.has(key) ? x.toLowerCase() : x;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (unique.length === 0) return null;
    if (LINK_KEYS.has(key)) return '\n' + unique.map(x => `  - ${yamlText(x)}`).join('\n');
    return `[${unique.map(x => (/^[\p{L}\p{N}_/-]+$/u.test(x) && !RESERVED.test(x) ? x : JSON.stringify(x))).join(', ')}]`;
  }
  const text = yamlText(raw);
  return text === '""' ? null : text;
}

function safeRel(rel) {
  return typeof rel === 'string' && rel !== '' && !path.isAbsolute(rel)
    && !rel.split(/[\\/]/).includes('..');
}

function applyPlan(folder, plan, outDir, { dryRun, overwrite }) {
  const notes = walkNotes(folder);
  // Names a "related" link may point at: file name without extension, or the
  // folder-relative path without extension, case-insensitive.
  const known = new Set();
  for (const p of notes) {
    const rel = relPath(folder, p).replace(/\.[^./]+$/, '').toLowerCase();
    known.add(rel);
    known.add(rel.split('/').pop());
  }

  if (!dryRun) {
    const resolvedOut = path.resolve(outDir);
    const resolvedIn = path.resolve(folder);
    if (resolvedOut === resolvedIn || resolvedOut.startsWith(resolvedIn + path.sep)) {
      die('Refused: --out must not be the folder itself or inside it.');
    }
    if (fs.existsSync(resolvedOut) && fs.readdirSync(resolvedOut).length > 0) {
      die(`Refused: ${outDir} already exists and is not empty. Nothing was written.`);
    }
    fs.cpSync(resolvedIn, resolvedOut, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
  }

  const report = [];
  for (const [rel, entry] of Object.entries(plan)) {
    const item = { path: rel, status: 'unchanged', added: [], kept: [], dropped: [] };
    report.push(item);
    try {
      if (!safeRel(rel) || !ALLOWED.has(path.extname(rel).toLowerCase())) throw new Error('not a note path inside the folder');
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('plan entry must be an object');
      const src = path.join(folder, rel);
      const read = readNote(src);
      if (read.error) throw new Error(read.error);
      const text = read.text;
      const parsed = fm.parse(text);
      let next = parsed.present ? parsed : fm.emptyFor(text);
      const have = new Set(fm.fields(parsed).map(f => f.key.toLowerCase()));
      const selfName = path.basename(rel).replace(/\.[^.]+$/, '').toLowerCase();

      for (const [key, raw] of Object.entries(entry)) {
        if (!fm.isValidKey(key)) throw new Error(`"${key}" is not a valid field name`);
        if (have.has(key.toLowerCase()) && !overwrite) { item.kept.push(key); continue; }
        let input = raw;
        if (LINK_KEYS.has(key.toLowerCase()) && Array.isArray(raw)) {
          input = raw.filter(name => {
            const n = String(name).trim().replace(/\.(md|markdown|txt)$/i, '').toLowerCase();
            const ok = n && n !== selfName && known.has(n);
            if (!ok) item.dropped.push(String(name));
            return ok;
          }).map(name => String(name).trim().replace(/\.(md|markdown|txt)$/i, ''));
        }
        const value = fieldValue(key.toLowerCase() === 'tags' ? 'tags' : key.toLowerCase(), input);
        if (value === null) continue;
        next = fm.setField(next, key, value);
        item.added.push(key);
      }

      if (item.added.length === 0) continue;
      const result = fm.apply(text, next);
      checkBytes(text, result.text);
      item.status = 'updated';
      if (!dryRun) {
        const dst = path.join(outDir, rel);
        fs.writeFileSync(dst, result.text, { encoding: 'utf8', mode: fs.statSync(src).mode });
      }
    } catch (e) {
      item.status = 'error';
      item.error = e.message;
    }
  }

  // Audit: every note body in the new copy must match the original.
  let audited = 0;
  const mismatched = [];
  if (!dryRun) {
    for (const p of notes) {
      const rel = relPath(folder, p);
      const a = readNote(p);
      const b = readNote(path.join(outDir, rel));
      if (a.error || b.error) continue;
      audited++;
      if (fm.parse(a.text).body !== fm.parse(b.text).body) mismatched.push(rel);
    }
  }
  return { notes: notes.length, report, audited, mismatched };
}

function runFolderCommand(cmd, rawArgs) {
  const args = [...rawArgs];
  const dryRun = args.includes('--dry-run');
  const overwrite = args.includes('--overwrite');
  const outDir = takeOpt(args, '--out');
  const preview = Number(takeOpt(args, '--preview') || 500);
  const rest = args.filter(a => !a.startsWith('--'));
  const folder = rest[0];
  if (!folder) usage();
  let st;
  try { st = fs.statSync(folder); } catch (e) { die(`Cannot read ${folder}: ${e.message}`); }
  if (!st.isDirectory()) die(`${folder} is not a folder.`);

  if (cmd === 'inventory') {
    process.stdout.write(JSON.stringify(inventory(folder, Number.isFinite(preview) ? preview : 500), null, 2) + '\n');
    return;
  }

  const planFile = rest[1];
  if (!planFile) usage();
  if (!dryRun && !outDir) die('Refused: apply needs --out <newfolder> so the original is never modified.');
  let plan;
  try { plan = JSON.parse(fs.readFileSync(planFile, 'utf8')); } catch (e) { die(`Cannot read the plan: ${e.message}`); }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) die('The plan must be a JSON object mapping note paths to fields.');

  const res = applyPlan(folder, plan, outDir, { dryRun, overwrite });
  const count = (s) => res.report.filter(r => r.status === s).length;
  for (const r of res.report) {
    const bits = [];
    if (r.added.length) bits.push('+' + r.added.join(' +'));
    if (r.kept.length) bits.push('kept existing: ' + r.kept.join(', '));
    if (r.dropped.length) bits.push('dropped unknown related: ' + r.dropped.join(', '));
    if (r.error) bits.push('ERROR: ' + r.error);
    if (bits.length) process.stdout.write(`${r.status.padEnd(9)} ${r.path}  ${bits.join('; ')}\n`);
  }
  process.stdout.write(`\n${dryRun ? 'DRY RUN. ' : ''}${res.notes} notes in folder, ${count('updated')} ${dryRun ? 'would be ' : ''}updated, ${count('unchanged')} unchanged, ${count('error')} errors.\n`);
  if (!dryRun) {
    process.stdout.write(`Audit: ${res.audited} note bodies compared with the originals, ${res.mismatched.length} differ.\n`);
    if (res.mismatched.length) die('Body mismatch in: ' + res.mismatched.join(', '));
    process.stdout.write(`Written to ${outDir}. The original folder was not modified.\n`);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'inventory' || args[0] === 'apply') {
    runFolderCommand(args[0], args.slice(1));
    return;
  }
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
