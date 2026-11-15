// Привязка чисел к меткам «дом / кв / подъезд / этаж».
//
// В адресах встречаются два стиля, и часто оба в одной строке:
//   метка → число:  «дом 5, кв 191, подъезд 2»      («кв 191»)
//   число → метка:  «12дом 4подъезд 191кв» (слитно) («191 кв»)
// Когда метки идут подряд, у «подъезд» есть число и слева, и справа: «дом 12 подъезд 4 этаж 3».
// Жадные регулярки берут левое число — и дом становится 3, а подъезд 12.
//
// Здесь для каждой цепочки «числа + метки» перебирается, с какой стороны каждая метка берёт своё
// число (смешанные стили в одной строке допустимы: «1/2, кв. 191, 3 подъезд»), и выбирается разбор,
// где все метки получили число, а лишних чисел меньше всего. Лишнее число — обычно номер дома рядом
// с названием улицы, его дальше подберёт основной парсер.

const LABELS = {
  apartment: ["квартира", "кв", "пәтер", "пәт", "apartment", "apt", "flat", "kv"],
  entrance: ["подъезд", "подьезд", "подезд", "подъ", "под", "кіреберіс", "entrance", "entr"],
  floor: ["этаж", "эт", "қабат", "floor", "fl"],
  house: ["дом", "д", "үй", "house", "bldg"]
};
const LABEL_TYPE = new Map(Object.entries(LABELS).flatMap(([type, words]) => words.map(word => [word, type])));

// Число: «191», «12а», «55/6», «1\2». За ним не должна идти буква/цифра, иначе это не номер.
const TOKEN = /(\d+(?:[/\\]\d+)*\p{L}?)(?![\p{L}\p{N}])|([\p{L}][\p{L}\p{N}]*)|([\s,;.:№#=-]+)|(.)/gsu;

function tokenize(text) {
  const tokens = [];
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index;
    const end = start + match[0].length;
    if (match[1] !== undefined) tokens.push({ kind: "num", value: match[1], start, end });
    else if (match[2] !== undefined) {
      const type = LABEL_TYPE.get(match[2].toLocaleLowerCase("ru"));
      tokens.push(type ? { kind: "label", type, start, end } : { kind: "word", start, end });
    } else if (match[3] !== undefined) tokens.push({ kind: "sep", comma: /[,;]/u.test(match[3]), start, end });
    else tokens.push({ kind: "other", start, end });
  }
  return tokens;
}

// Цепочка: подряд идущие числа и метки, между которыми только разделители (пробел, запятая, точка, №...).
function buildRuns(tokens) {
  const runs = [];
  let current = null;
  let gap = { comma: false };
  for (const token of tokens) {
    if (token.kind === "num" || token.kind === "label") {
      if (!current) { current = []; runs.push(current); gap = { comma: false }; }
      current.push({ ...token, commaBefore: current.length > 0 && gap.comma });
      gap = { comma: false };
    } else if (token.kind === "sep") {
      if (token.comma) gap.comma = true;
    } else {
      current = null;
    }
  }
  return runs;
}

// Цена разбора: чем меньше, тем лучше. Пороги подобраны так, чтобы порядок приоритетов был
// «все метки получили число» > «меньше лишних чисел» > «не через запятую» > «один стиль подряд».
const COST = { unbound: 100, leftover: 10, crossComma: 5, styleSwitch: 1 };
const MAX_EXHAUSTIVE_LABELS = 10;

function costOf(items, labelIndexes, directions) {
  const taken = new Set();
  const bindings = [];
  let cost = 0;
  let previousDirection = null;
  labelIndexes.forEach((itemIndex, i) => {
    const direction = directions[i];
    const item = items[itemIndex];
    const neighbour = direction === "R" ? items[itemIndex + 1] : items[itemIndex - 1];
    if (neighbour?.kind === "num" && !taken.has(neighbour)) {
      taken.add(neighbour);
      bindings.push({ label: item, number: neighbour });
      if (direction === "R" ? neighbour.commaBefore : item.commaBefore) cost += COST.crossComma;
      if (previousDirection && previousDirection !== direction) cost += COST.styleSwitch;
      previousDirection = direction;
    } else {
      cost += COST.unbound;
    }
  });
  cost += items.filter(item => item.kind === "num" && !taken.has(item)).length * COST.leftover;
  return { cost, bindings };
}

// Перебор «число справа / число слева» для каждой метки; при равной цене побеждает «справа» (кв 191),
// потому что в этом случае число перед цепочкой остаётся номером дома.
function bindRun(items) {
  const labelIndexes = items.flatMap((item, index) => item.kind === "label" ? [index] : []);
  const count = labelIndexes.length;
  const candidates = count <= MAX_EXHAUSTIVE_LABELS
    ? Array.from({ length: 2 ** count }, (_, mask) => labelIndexes.map((_, i) => (mask >> (count - 1 - i)) & 1 ? "L" : "R"))
    : [labelIndexes.map(() => "R"), labelIndexes.map(() => "L")];
  let best = null;
  for (const directions of candidates) {
    const attempt = costOf(items, labelIndexes, directions);
    if (!best || attempt.cost < best.cost) best = attempt;
  }
  return best;
}

/**
 * Находит в тексте пары «метка + число» и вырезает их.
 *
 * @param {string} text
 * @returns {{ fields: { house?: string, apartment?: string, entrance?: string, floor?: string }, text: string }}
 */
export function bindLabeledNumbers(text) {
  const fields = {};
  const spans = [];

  for (const items of buildRuns(tokenize(text))) {
    if (!items.some(item => item.kind === "label")) continue;
    for (const { label, number } of bindRun(items).bindings) {
      if (fields[label.type] !== undefined) continue; // второе «кв» оставляем основному парсеру
      fields[label.type] = number.value;
      spans.push({ start: Math.min(label.start, number.start), end: Math.max(label.end, number.end) });
    }
  }

  let rest = text;
  for (const { start, end } of spans.sort((a, b) => b.start - a.start)) {
    // Точка сокращения («кв.») и № принадлежат метке — забираем их вместе с ней.
    const tail = /^[.№#]*/u.exec(rest.slice(end))[0].length;
    rest = `${rest.slice(0, start)} ${rest.slice(end + tail)}`;
  }
  return { fields, text: rest };
}
