// AutoCap: typo correction and sentence-start auto-capitalization.
//
// When a word is finished (space, newline, or punctuation typed after it):
//   1. If the word is in the typo list (typos.js) it is replaced, keeping
//      the case you typed: "teh" -> "the", "Teh" -> "The".
//   2. If the word begins a sentence, the first letter is uppercased and
//      the second letter lowercased. "tHis" and "THis" both become "This".
//
// Pure functions only. No editor imports, so this file is easy to test.

import TYPOS from './typos.js';
import NEVER from './never.js';

const NEVER_SET = new Set(NEVER.map(w => w.toLowerCase()));

// Characters that end a word. Apostrophes are intentionally NOT boundaries,
// so "don't" is one word.
const WORD_BOUNDARY = /[\s.,;:!?()[\]{}"]/;

// Characters that, when typed, trigger a check of the word before them.
// Brackets and quotes are left out so the editor's auto-close-brackets
// handler keeps working untouched.
const TRIGGER_CHAR = /^[\s.,;:!?]$/;

// How much text before the word is examined to decide "sentence start".
const LOOKBACK = 200;

function isTriggerChar(ch) {
  return TRIGGER_CHAR.test(ch);
}

// True when the text ending right before a word marks a sentence start:
// the start of the document, a blank line, or terminal punctuation
// followed by whitespace. Closing quotes or brackets after the punctuation
// are allowed, so  `He left." the`  still counts.
function isSentenceStart(before) {
  if (/^\s*$/.test(before)) return true;
  if (/\n[ \t]*\n\s*$/.test(before)) return true;
  if (/[.!?]["')\]]*\s+$/.test(before)) return true;
  return false;
}

// Returns the corrected word, or null when nothing should change.
function correctWord(word) {
  if (word.length === 0) return null;
  if (!/^\p{L}/u.test(word)) return null;
  if (/\d/.test(word)) return null;
  if (/[\/@\\]/.test(word)) return null;

  const letters = word.replace(/[^\p{L}]/gu, '');
  // Leave acronyms and shouting alone: NASA, OK, TV, I'M.
  if (letters.length >= 2 && letters === letters.toUpperCase()) return null;

  let fixed = word[0].toUpperCase() + word.slice(1);
  if (fixed.length >= 2 && /\p{Lu}/u.test(fixed[1])) {
    fixed = fixed[0] + fixed[1].toLowerCase() + fixed.slice(2);
  }
  return fixed === word ? null : fixed;
}

// Returns the typo-corrected word, or null when the word is not a listed
// typo. Only lowercase and Capitalized forms match; ALL CAPS and mixed
// case are left alone so acronyms survive.
function correctTypo(word) {
  if (word.length < 2) return null;
  const lower = word.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TYPOS, lower)) return null;

  const rest = word.slice(1);
  const isLower = word === lower;
  const isCapitalized = !isLower && word[0] === word[0].toUpperCase() && rest === rest.toLowerCase();
  if (!isLower && !isCapitalized) return null;

  const fixed = TYPOS[lower];
  return isCapitalized ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
}

// The word ending exactly at `pos`, or '' when `pos` is not at a word end.
function wordBefore(sliceText, pos) {
  const windowFrom = Math.max(0, pos - LOOKBACK);
  const text = sliceText(windowFrom, pos);
  let start = text.length;
  while (start > 0 && !WORD_BOUNDARY.test(text[start - 1])) start--;
  return text.slice(start);
}

// Given a function that returns text in [from, to) of the document and a
// cursor position, find the word ending exactly at `pos` and decide whether
// to fix it. Returns { from, to, insert } or null.
//
// opts.prose: true for prose-like text (Prose mode, Plain Text, Markdown,
// untitled files). Enables the standalone "i" -> "I" rule.
function computeFix(sliceText, pos, opts = {}) {
  const windowFrom = Math.max(0, pos - LOOKBACK);
  const text = sliceText(windowFrom, pos);

  let start = text.length;
  while (start > 0 && !WORD_BOUNDARY.test(text[start - 1])) start--;
  if (start === text.length) return null;

  const word = text.slice(start);
  if (NEVER_SET.has(word.toLowerCase())) return null;
  const before = text.slice(0, start);

  let fixed = correctTypo(word) ?? word;
  if (opts.prose && fixed === 'i') fixed = 'I';
  if (isSentenceStart(before)) {
    fixed = correctWord(fixed) ?? fixed;
  }
  if (fixed === word) return null;

  return { from: windowFrom + start, to: pos, insert: fixed };
}

// Spacing tidy-up for prose-like text, decided when `typed` is about to be
// inserted at `pos`:
//   - punctuation typed after one or more spaces that follow a word:
//     { kind: 'strip', from } means remove [from, pos) before inserting.
//   - a second space typed between two words: { kind: 'swallow' } means
//     insert nothing. Skipped in Markdown, where two trailing spaces are a
//     line break, and after punctuation, for people who double-space
//     between sentences.
// Returns null when nothing should change.
const PUNCT_AFTER_SPACE = /^[.,;:!?]$/;
const WORD_END_CHAR = /[\p{L}\p{N}"')\]]/u;

function spacingAction(sliceText, pos, typed, opts = {}) {
  if (!opts.prose) return null;
  const text = sliceText(Math.max(0, pos - 64), pos);
  let spaces = 0;
  while (spaces < text.length && text[text.length - 1 - spaces] === ' ') spaces++;
  const prev = text[text.length - 1 - spaces];
  if (prev === undefined || !WORD_END_CHAR.test(prev)) return null;

  if (PUNCT_AFTER_SPACE.test(typed)) {
    return spaces > 0 ? { kind: 'strip', from: pos - spaces } : null;
  }
  if (typed === ' ' && !opts.markdown && spaces === 1 && /[\p{L}\p{N}]/u.test(prev)) {
    return { kind: 'swallow' };
  }
  return null;
}

export { isTriggerChar, isSentenceStart, correctWord, correctTypo, computeFix, wordBefore, spacingAction };
