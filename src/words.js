// Frequency-ranked dictionary for word completion. Most common word first.
//
// Intended source: Peter Norvig's count_1w.txt, derived from the Google Web
// Trillion Word Corpus, trimmed to the top 50,000 alphabetic words. The list
// is empty until that file can be fetched and its terms confirmed. Word
// completion still works from learned words and the current document.

const WORDS = [];

export default WORDS;
