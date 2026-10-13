// Words AutoCap must never touch. Matching ignores case, so "iphone",
// "iPhone" and "IPHONE" all match the first entry.
//
// A word listed here is skipped by every AutoCap rule: typo correction,
// sentence-start capitalization, and the standalone "i" rule. Word
// completion still learns and suggests it as usual.
//
// Edit freely: one word per line.

const NEVER = [
  'iPhone',
  'iPad',
  'iMac',
  'iOS',
  'macOS',
  'eBay',
  'YouTube',
];

export default NEVER;
