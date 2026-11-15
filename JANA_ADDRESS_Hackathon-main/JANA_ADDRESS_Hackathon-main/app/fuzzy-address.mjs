// Нечёткий поиск по справочнику без внешних зависимостей.

export const DEFAULT_THRESHOLD = 0.8;
export const DEFAULT_MIN_LENGTH = 5;

const FOLD = new Map(Object.entries({
  "ё": "е", "й": "и", "ъ": "ь",
  "ә": "а", "і": "и", "ң": "н", "ғ": "г", "ү": "у", "ұ": "у", "қ": "к", "ө": "о", "һ": "х"
}));
const LATIN_LOOKALIKES = new Map(Object.entries({
  a: "а", b: "в", c: "с", e: "е", h: "н", k: "к", m: "м", o: "о", p: "р", t: "т", x: "х", y: "у"
}));
export const STOP_WORDS = new Set([
  "город", "гор", "г", "қала", "қаласы",
  "область", "обл", "облысы", "облыс"
]);

function foldToken(token) {
  const mixed = /\p{Script=Cyrillic}/u.test(token) && /[a-z]/u.test(token);
  let output = "";
  for (let char of token) {
    if (mixed) char = LATIN_LOOKALIKES.get(char) ?? char;
    output += FOLD.get(char) ?? char;
  }
  return output;
}

export function matchKey(value, stopWords = STOP_WORDS) {
  const tokens = String(value ?? "").normalize("NFKC").toLocaleLowerCase("ru").match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.filter(token => !stopWords.has(token)).map(foldToken).join("");
}

export function damerauLevenshtein(a, b, maxDistance = Infinity) {
  if (a === b) return 0;
  const aLength = a.length;
  const bLength = b.length;
  if (Math.abs(aLength - bLength) > maxDistance) return maxDistance + 1;
  if (!aLength) return bLength;
  if (!bLength) return aLength;

  let beforePrevious = new Array(bLength + 1);
  let previous = Array.from({ length: bLength + 1 }, (_, index) => index);
  let current = new Array(bLength + 1);

  for (let i = 1; i <= aLength; i++) {
    current[0] = i;
    let rowMinimum = i;
    for (let j = 1; j <= bLength; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrevious[j - 2] + 1);
      }
      current[j] = value;
      if (value < rowMinimum) rowMinimum = value;
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
    
    const temp = beforePrevious;
    beforePrevious = previous;
    previous = current;
    current = temp;
  }
  return previous[bLength];
}

export function similarity(a, b) {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - damerauLevenshtein(a, b) / longest;
}

export function jaroWinkler(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array(a.length).fill(false);
  const bMatched = new Array(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const from = Math.max(0, i - window);
    const to = Math.min(b.length - 1, i + window);
    for (let j = from; j <= to; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = bMatched[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;

  let transpositions = 0;
  for (let i = 0, j = 0; i < a.length; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[j]) j++;
    if (a[i] !== b[j]) transpositions++;
    j++;
  }

  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return jaro > 0.7 ? jaro + prefix * 0.1 * (1 - jaro) : jaro;
}

export function maxEdits(length, threshold = DEFAULT_THRESHOLD, minLength = DEFAULT_MIN_LENGTH) {
  if (length < minLength) return 0;
  return Math.min(3, Math.floor(length * (1 - threshold) + 1e-9));
}

function looksLikeInflection(query, key) {
  if (!key || query.length <= key.length || !query.startsWith(key)) return false;
  const lastChar = key[key.length - 1];
  const tail = query.slice(key.length);
  return tail !== lastChar.repeat(tail.length);
}

export function createFuzzyMatcher(entries, {
  aliasesOf = entry => [entry.name, ...(entry.aliases ?? [])],
  threshold: defaultThreshold = DEFAULT_THRESHOLD,
  minLength: defaultMinLength = DEFAULT_MIN_LENGTH
} = {}) {
  const index = [];
  const exact = new Map();

  for (const entry of entries) {
    for (const alias of new Set(aliasesOf(entry))) {
      const key = matchKey(alias);
      if (!key) continue;
      index.push({ entry, alias, key });
      if (!exact.has(key)) exact.set(key, []);
      exact.get(key).push({ entry, alias });
    }
  }

  function search(query, { threshold = defaultThreshold, minLength = defaultMinLength, limit = 5 } = {}) {
    const key = matchKey(query);
    if (!key) return [];

    const hits = exact.get(key);
    if (hits) {
      return hits.slice(0, limit).map(({ entry, alias }) =>
        ({ entry, alias, key, score: 1, distance: 0, jaroWinkler: 1, exact: true }));
    }

    const best = new Map();
    for (const candidate of index) {
      const longest = Math.max(key.length, candidate.key.length);
      const allowed = maxEdits(longest, threshold, minLength);
      if (allowed === 0 || Math.abs(key.length - candidate.key.length) > allowed) continue;
      const distance = damerauLevenshtein(key, candidate.key, allowed);
      if (distance > allowed) continue;
      const score = 1 - distance / longest;
      if (score < threshold) continue;
      const previous = best.get(candidate.entry);
      if (!previous || score > previous.score) {
        best.set(candidate.entry, {
          entry: candidate.entry, alias: candidate.alias, key: candidate.key,
          score, distance, jaroWinkler: jaroWinkler(key, candidate.key), exact: false
        });
      }
    }

    return [...best.values()]
      .sort((a, b) => b.score - a.score || b.jaroWinkler - a.jaroWinkler)
      .slice(0, limit);
  }

  function find(query, { allowInflection = false, ...options } = {}) {
    const [first, second] = search(query, { ...options, limit: 2 });
    if (!first) return null;
    if (first.exact) return first;
    if (!allowInflection && looksLikeInflection(matchKey(query), first.key)) return null;
    
    if (second && second.entry !== first.entry && (first.score - second.score) < 1e-9 && Math.abs(first.jaroWinkler - second.jaroWinkler) < 0.02) {
      return null;
    }
    return first;
  }

  function has(query) {
    return exact.has(matchKey(query));
  }

  return { find, search, has };
}

const SEGMENT_PATTERN = /[^,;|/\n]+/gu;
const SEGMENT_PARTS = /^(\s*)((?:город|гор|қала)\s+|г\.\s*|г\s+)?(.*?)(\s+қаласы)?\s*$/iu;
const REGION_LABEL = /(?:^|\s)(?:обл\.?|область|облысы|облыс)$/iu;

export function createAdminFuzzy(cities, regions, { threshold: defaultThreshold = DEFAULT_THRESHOLD } = {}) {
  const cityMatcher = createFuzzyMatcher(cities, { threshold: defaultThreshold });
  const regionMatcher = createFuzzyMatcher(regions, { threshold: defaultThreshold });

  const findCity = (query, options) => cityMatcher.find(query, options);
  const findRegion = (query, options) => regionMatcher.find(query, options);

  function containsExact(matcher, text) {
    const tokens = text.match(/[\p{L}\p{N}]+/gu) ?? [];
    for (let start = 0; start < tokens.length; start++) {
      for (let length = 1; length <= 3 && start + length <= tokens.length; length++) {
        if (matcher.has(tokens.slice(start, start + length).join(" "))) return true;
      }
    }
    return false;
  }

  function fuzzyAdminMentions(rawAddress, { threshold = defaultThreshold } = {}) {
    const text = String(rawAddress ?? "").normalize("NFKC");
    const skipCity = containsExact(cityMatcher, text);
    const skipRegion = containsExact(regionMatcher, text);
    const best = { city: null, region: null };

    for (const segment of text.matchAll(SEGMENT_PATTERN)) {
      const parts = SEGMENT_PARTS.exec(segment[0]);
      const core = parts?.[3]?.trim();
      if (!core || core.length > 40 || /\d/u.test(core) || !matchKey(core)) continue;

      const regionHint = REGION_LABEL.test(core);
      const labeled = Boolean(parts[2] || parts[4]);
      const options = { threshold, allowInflection: labeled || regionHint };
      const found = {
        city: skipCity ? null : cityMatcher.find(core, options),
        region: skipRegion ? null : regionMatcher.find(core, options)
      };
      if (found.city?.exact || found.region?.exact) continue;

      const kind = (regionHint ? ["region", "city"] : ["city", "region"]).find(name => found[name]);
      if (!kind) continue;

      const start = segment.index + parts[1].length + (parts[2]?.length ?? 0);
      const mention = {
        kind, entry: found[kind].entry, text: core, start, end: start + core.length,
        score: found[kind].score, distance: found[kind].distance
      };
      if (!best[kind] || mention.score > best[kind].score) best[kind] = mention;
    }
    return [best.city, best.region].filter(Boolean).sort((a, b) => a.start - b.start);
  }

  function correctAdminTypos(rawAddress, options) {
    const source = String(rawAddress ?? "").normalize("NFKC");
    const mentions = fuzzyAdminMentions(source, options);
    let text = source;
    for (const mention of [...mentions].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, mention.start) + mention.entry.name + text.slice(mention.end);
    }
    return {
      text,
      corrections: mentions.map(({ text: from, entry, kind, score }) => ({ from, to: entry.name, kind, score }))
    };
  }

  return { findCity, findRegion, fuzzyAdminMentions, correctAdminTypos };
}