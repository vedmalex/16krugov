const VOWELS = new Set("аеёиоуыэюя");

/** One vowel per syllable. Trailing consonants stay with the previous syllable. */
export function syllablesOfWord(raw: string): string[] {
  const vowels: number[] = [];
  for (let i = 0; i < raw.length; i++) if (VOWELS.has(raw[i].toLowerCase())) vowels.push(i);
  if (vowels.length < 2) return [raw];
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < vowels.length - 1; i++) {
    const left = vowels[i] + 1;
    const right = vowels[i + 1];
    let split = left;
    const cluster = raw.slice(left, right).toLowerCase();
    const sonorant = cluster.match(/^[йрлмн][ьъ]?(?=[бвгджзклмнпрстфхцчшщ])/u);
    if (sonorant) split += sonorant[0].length;
    else if (i === 0 && /^раз[бвгджзклмнпрстфхцчшщ]/iu.test(raw) && cluster.startsWith("з")) split++;
    out.push(raw.slice(start, split));
    start = split;
  }
  out.push(raw.slice(start));
  return out;
}

export type Beat = { text: string; wordStart: boolean };

/** Split a drill line into one beat per syllable. Dashes and spaces are boundaries. */
export function beatsOf(text: string): Beat[] {
  const beats: Beat[] = [];
  const chunks = text.split(/[·\n]+/).map((part) => part.trim()).filter(Boolean);
  for (const chunk of chunks) {
    for (const word of chunk.split(/\s+/).filter(Boolean)) {
      const pieces = word.split(/[–—-]+/).filter(Boolean);
      let wordStart = true;
      for (const piece of pieces) {
        for (const syllable of syllablesOfWord(piece)) {
          beats.push({ text: syllable, wordStart });
          wordStart = false;
        }
      }
    }
  }
  return beats.length > 0 ? beats : [{ text, wordStart: true }];
}

export function wordLines(elements: readonly string[], wordStarts: readonly number[]): { text: string; index: number }[][] {
  const lines: { text: string; index: number }[][] = [];
  let line: { text: string; index: number }[] = [];
  elements.forEach((text, index) => {
    if (wordStarts.includes(index) && line.length > 0) {
      lines.push(line);
      line = [];
    }
    const previous = line[line.length - 1];
    const punctuation = /^[,.;:!?…%)\]»”]/u.test(text);
    if (punctuation && previous) {
      previous.text += text;
    } else {
      line.push({ text, index });
    }
  });
  if (line.length > 0) lines.push(line);
  return lines;
}

export type Cell = { text: string; index: number; word: number };

/** Single letters in a row share one line; word rows can wrap to fit the screen. */
export function displayRows(elements: readonly string[], wordStarts: readonly number[]): Cell[][] {
  const rows: Cell[][] = [];
  let letters: Cell[] = [];
  const flush = () => {
    if (letters.length > 0) rows.push(letters);
    letters = [];
  };
  wordLines(elements, wordStarts).forEach((line, word) => {
    if (line.length === 1 && [...line[0].text].length === 1) {
      letters.push({ ...line[0], word });
      return;
    }
    flush();
    rows.push(line.map((token) => ({ ...token, word })));
  });
  flush();
  return rows;
}

export function wordIndexAt(index: number, wordStarts: readonly number[]): number {
  let word = 0;
  for (let start = 0; start < wordStarts.length; start += 1) {
    if (wordStarts[start] <= index) word = start;
  }
  return word;
}

export function expandParts(parts: string[]): { elements: string[]; wordStarts: number[] } {
  const elements: string[] = [];
  const wordStarts: number[] = [];
  for (const part of parts) {
    for (const beat of beatsOf(part)) {
      if (beat.wordStart) wordStarts.push(elements.length);
      elements.push(beat.text);
    }
  }
  return { elements, wordStarts };
}
