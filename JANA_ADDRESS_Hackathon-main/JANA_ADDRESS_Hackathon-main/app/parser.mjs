import { cities, correctAdminTypos, historicalStreetNames, livingAreas, regions, urbanDistricts } from "./catalog.mjs";
import { bindLabeledNumbers } from "./labels.mjs";
import { splitGluedTokens } from "./normalize.mjs";

const FIELD_NAMES = [
  "province", "city", "district", "living_area", "street_type", "street_name",
  "house", "apartment", "entrance", "floor", "landmark"
];

const STREET_TYPES = [
  { type: "микрорайон", aliases: ["микрорайон", "микр", "мкр", "мкрн"] },
  { type: "проспект", aliases: ["проспект", "пр-т", "пр", "просп"] },
  { type: "переулок", aliases: ["переулок", "пер"] },
  { type: "шоссе", aliases: ["шоссе", "ш"] },
  { type: "трасса", aliases: ["трасса"] },
  { type: "бульвар", aliases: ["бульвар", "бул"] },
  { type: "набережная", aliases: ["набережная", "наб"] },
  { type: "площадь", aliases: ["площадь", "пл"] },
  { type: "улица", aliases: ["улица", "ул", "көше", "көшесі", "коше", "кошеси"] },
  { type: "квартал", aliases: ["квартал"] }
];

const DETAIL_PATTERNS = {
  apartment: [
    /(?:^|[^\p{L}\p{N}])(?:квартира|кв(?:артира)?|кв\.|пәтер|пәт\.|apartment|flat|apt|kv)\s*(?:№|#|[:=-])?\s*(\d+[а-яa-z]?)(?=$|[^\p{L}\p{N}])/iu,
    /(?:^|[^\p{L}\p{N}])(\d+[а-яa-z]?)\s*(?:квартира|кв\.?|пәтер|пәт\.?|apartment|flat|apt|kv)(?![\p{L}\p{N}])/iu
  ],
  entrance: [
    /(?:^|[^\p{L}\p{N}])(\d+[а-яa-z]?)\s*(?:подъезд|подьезд|подезд|подъ|кіреберіс|entrance|entr)(?![\p{L}\p{N}])/iu,
    /(?:^|[^\p{L}\p{N}])(?:подъезд|подьезд|подезд|под\.?|кіреберіс|подъ|entrance|entr)\s*(?:№|#|[:=-])?\s*(\d+[а-яa-z]?)(?=$|[^\p{L}\p{N}])/iu,
  ],
  floor: [
    /(?:^|[^\p{L}\p{N}])(\d+)\s*(?:этаж|эт\.?|қабат|floor|fl)(?![\p{L}\p{N}])/iu,
    /(?:^|[^\p{L}\p{N}])(?:этаж|эт\.?|қабат|этажность|floor|fl)\s*(?:№|#|[:=-])?\s*(\d+[а-яa-z]?)(?=$|[^\p{L}\p{N}])/iu,
  ]
};

const PLACE_PREFIX = /(?:^|[^\p{L}\p{N}])(?:город|г\.?|қала(?:сы)?|қаласы|область|обл\.?|облысы)(?=$|[^\p{L}\p{N}])\s*/giu;
const INVISIBLE = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu;
const aliasPatternCache = new Map();

function trimValue(value) {
  return value?.replace(/^[\s,;:.#№/\\-]+|[\s,;:.#№/\\-]+$/gu, "").replace(/\s+/gu, " ").trim() || null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function boundedAlias(alias) {
  if (!aliasPatternCache.has(alias)) {
    aliasPatternCache.set(alias, new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegex(alias).replace(/\s+/gu, "\\s*")})(?=$|[^\\p{L}\\p{N}])`, "iu"));
  }
  return aliasPatternCache.get(alias);
}

function aliasEntries(entries) {
  return entries.flatMap(entry => entry.aliases.map(alias => ({ entry, alias })))
    .sort((a, b) => b.alias.length - a.alias.length)
}

const REGION_ALIASES = aliasEntries(regions);
const CITY_ALIASES = aliasEntries(cities);
const ALL_DISTRICTS = [...new Set(Object.values(urbanDistricts).flat())].sort((a, b) => b.length - a.length);

function stripAliases(text, entry) {
  let output = text;
  for (const alias of entry.aliases) {
    output = output.replace(new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegex(alias).replace(/\s+/gu, "\\s*")}(?=$|[^\\p{L}\\p{N}])`,
      "giu"
    ), " ");
  }
  return output;
}

function separateAttachedCity(text) {
  for (const { alias } of CITY_ALIASES) {
    const pattern = new RegExp(`(\\d)(${escapeRegex(alias).replace(/\s+/gu, "\\s*")})$`, "iu");
    const match = pattern.exec(text);
    if (match) {
      const splitAt = match.index + match[1].length;
      return `${text.slice(0, splitAt)} ${match[2]}`;
    }
  }
  for (const { alias } of CITY_ALIASES) {
    const pattern = new RegExp(`^(${escapeRegex(alias).replace(/\s+/gu, "\\s*")})(?=[\\p{L}])`, "iu");
    const match = pattern.exec(text);
    if (match && /^[\p{L}][\p{L}\s-]*\d+(?:[/\\-]\d+)*[a-zа-яё]?$/iu.test(text.slice(match[0].length))) {
      return `${match[1]} ${text.slice(match[0].length)}`;
    }
  }
  return text;
}

function matchAdmin(text) {
  let output = text;
  let province = null;
  let city = null;

  for (const { entry, alias } of REGION_ALIASES) {
    if (!boundedAlias(alias).test(output)) continue;
    province = entry.name;
    output = stripAliases(output, entry);
    break;
  }

  for (const { entry, alias } of CITY_ALIASES) {
    const match = boundedAlias(alias).exec(output);
    if (!match) continue;
    const start = match.index + match[1].length;
    const before = output.slice(0, start).trim();
    const after = output.slice(start + match[2].length);
    const explicitLabel = /(?:^|\s)(?:город|г\.?|қала(?:сы)?|қаласы)$/iu.test(before);
    const kazakhSuffix = /^\s*қаласы(?=$|[^\p{L}\p{N}])/iu.test(after);
    const regionFirst = Boolean(province) && /^[\s,;]*$/u.test(before);
    const standaloneSegment = output.split(/[,;|/]+/u).some(segment => {
      const normalized = segment.normalize("NFKC").toLocaleLowerCase("ru")
        .replace(/^(?:город|г\.?|қала(?:сы)?|қаласы)\s*/iu, "")
        .replace(/\s*қаласы$/iu, "").trim();
      return normalized === alias.normalize("NFKC").toLocaleLowerCase("ru");
    });
    const addressEdge = (!before && /\d/u.test(after)) || (!after.trim() && /\d/u.test(before));
    if (!explicitLabel && !kazakhSuffix && !regionFirst && !standaloneSegment && !addressEdge) continue;
    city = entry.name;
    output = stripAliases(output, entry);
    if (!province) {
      province = ["Астана", "Алматы", "Шымкент"].includes(entry.name) ? entry.name : entry.province;
    }
    break;
  }

  return province || city ? { province, city, text: output } : null;
}

function detectDistrict(text, city) {
  const districts = city && urbanDistricts[city]
    ? [...urbanDistricts[city]].sort((a, b) => b.length - a.length)
    : ALL_DISTRICTS;

  for (const district of districts) {
    const alias = escapeRegex(district).replace(/ский$/iu, "(?:ский|ского|скому|ским|ском)")
      .replace(/цкий$/iu, "(?:цкий|цкого|цкому|цким|цком)");
    const expression = new RegExp(`(^|[^\\p{L}\\p{N}])(${alias})\\s*(?:р\\s*[-.]?\\s*н\\.?|аудан|(?<!микро)район)(?=$|[^\\p{L}\\p{N}])`, "iu");
    const match = expression.exec(text);
    if (match) {
      return { district, text: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}` };
    }
  }

  const generic = /(?:^|[^\p{L}\p{N}])((?:[\p{L}][\p{L}-]*\s+){0,2}[\p{L}][\p{L}-]*)\s*(?:р\s*[-.]?н\.?|аудан|(?<!микро)район)(?=$|[^\p{L}\p{N}])/iu.exec(text);
  if (generic) {
    return {
      district: trimValue(generic[1]),
      text: `${text.slice(0, generic.index)} ${text.slice(generic.index + generic[0].length)}`
    };
  }
  return null;
}

function captureByPatterns(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      return {
        value: match[1],
        text: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
      };
    }
  }
  return null;
}

function extractLabeledHouse(text) {
  const patterns = [
    /(?:^|[^\p{L}\p{N}])(?:дом|д\.?|үй|house|bldg)\s*(?:№|#|[:=-])?\s*(\d+(?:[/\\-]\d+)*[a-zа-яё]?)(?=$|[^\p{L}\p{N}])/iu,
    /(?:^|[^\p{L}\p{N}])(\d+(?:[/\\-]\d+)*[a-zа-яё]?)\s*(?:дом|үй|house|bldg)(?![\p{L}\p{N}])/iu
  ];
  return captureByPatterns(text, patterns);
}

function extractStreet(text) {
  let working = text;
  let streetType = null;
  let streetName = null;
  let livingArea = null;

  for (const entry of STREET_TYPES) {
    if (entry.type === "квартал") {
      const numberedQuarter = /(?:^|[^\p{L}\p{N}])(\d+[а-яa-z]?)\s*квартал(?![\p{L}\p{N}])/iu.exec(working);
      if (numberedQuarter) {
        streetName = numberedQuarter[1];
        working = `${working.slice(0, numberedQuarter.index)} ${working.slice(numberedQuarter.index + numberedQuarter[0].length)}`;
        streetType = entry.type;
        break;
      }
    }
    for (const alias of [...entry.aliases].sort((a, b) => b.length - a.length)) {
      const pattern = boundedAlias(alias);
      const match = pattern.exec(working);
      if (!match) continue;

      const start = match.index + match[1].length;
      const end = start + match[2].length;
      const before = working.slice(0, start);
      const after = working.slice(end);
      if (entry.type === "квартал") {
        const leadingNumber = /(\d+[а-яa-z]?)(?:\s*)$/iu.exec(before);
        const trailingNumber = /^\s*(\d+[а-яa-z]?)(?=$|[^\p{L}\p{N}])/iu.exec(after);
        streetName = leadingNumber?.[1] ?? trailingNumber?.[1] ?? null;
        if (leadingNumber) working = `${before.slice(0, leadingNumber.index)} ${after}`;
        else if (trailingNumber) working = `${before} ${after.slice(trailingNumber[0].length)}`;
        else working = `${before} ${after}`;
      } else {
        streetType = entry.type;
        const separator = Math.max(before.lastIndexOf(","), before.lastIndexOf(";"));
        const prefix = separator >= 0 ? trimValue(before.slice(0, separator)) : null;
        const suffix = separator >= 0 ? trimValue(before.slice(separator + 1)) : null;
        if (prefix && !suffix) {
          livingArea = prefix;
          const prefixStart = before.lastIndexOf(livingArea);
          working = `${before.slice(0, prefixStart)} ${after}`;
        } else {
          working = `${before} ${after}`;
        }
      }
      break;
    }
    if (streetType || streetName) break;
  }

  const noHouse = /(?:^|[^\p{L}\p{N}])(?:дом|д\.?|үй|house|bldg|квартира|кв\.?|пәтер|подъезд|подьезд|подезд|этаж|эт\.?|қабат|apartment|flat|apt|entrance|floor)(?![\p{L}\p{N}])/iu;
  const boundary = noHouse.exec(working);
  if (boundary) working = working.slice(0, boundary.index);
  const parts = working.split(/[,;|]/u).map(trimValue).filter(Boolean);
  streetName ??= parts.join(" ");
  return {
    street_type: streetType,
    street_name: trimValue(streetName),
    living_area: livingArea,
    remaining: working
  };
}

// --- Ориентиры и шум -------------------------------------------------------------------------
// Фраза-ориентир начинается с маркера локации ("возле", "около", "рядом с", ...) и забирает
// несколько следующих слов, но не дальше запятой, цифры (это уже номер дома) или служебного слова.
// Раньше такие фразы оставались в тексте и жадно попадали в street_name.
const LOCATION_MARKERS = String.raw`(?:недалеко\s+от|поблизости\s+от|вблизи|близ|возле|около|рядом\s+с|рядом|напротив|позади|near|next\s+to|opposite|behind|in\s+front\s+of|beside)`;
const LOCATION_MARKER = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${LOCATION_MARKERS})(?![\\p{L}\\p{N}])`, "giu");
// Казахские послелоги стоят после существительного: "аялдама жанында".
const KAZAKH_POSTPOSITION = /(?:^|[^\p{L}\p{N}])([\p{L}][\p{L}\p{N}-]*\s+(?:жанында|қасында|маңында|алдында|қарсысында))(?![\p{L}\p{N}])/giu;
// Служебные просьбы курьеру ("позвоните за час") — тоже не часть улицы: до запятой или конца строки.
const COURIER_NOTE = /(?:^|[^\p{L}\p{N}])((?:пожалуйста\s+)?(?:по|пере)?звоните|позвонить|звонить)(?![\p{L}\p{N}])[^,;|()]{0,60}/giu;
const PHRASE_WORD = /^\s+[\p{L}][\p{L}\p{N}-]*/u;
const PHRASE_NUMBER = /^\s*№\s*\d+[а-яa-z]?/iu;
const MAX_PHRASE_WORDS = 5;
const PHRASE_STOP_WORDS = new Set([
  ...STREET_TYPES.flatMap(({ aliases }) => aliases),
  "дом", "д", "үй", "кв", "квартира", "пәтер", "подъезд", "подьезд", "подезд", "этаж", "эт", "қабат",
  "город", "г", "область", "обл", "район"
]);
const LANDMARK_KEYWORDS = "магазин|дүкен|shop|qazpost|kazpost|qpost|почта|аптек|кафе|ресторан|рынок|торговый\\s+центр|тц|остановк|больниц|поликлиник";

function findLocationPhrases(text) {
  const spans = [];
  const overlaps = (start, end) => spans.some(span => start < span.end && end > span.start);

  for (const match of text.matchAll(LOCATION_MARKER)) {
    const start = match.index + match[0].length - match[1].length;
    if (overlaps(start, start + 1)) continue;
    let end = start + match[1].length;
    let words = 0;
    while (words < MAX_PHRASE_WORDS) {
      const word = PHRASE_WORD.exec(text.slice(end));
      if (!word) break;
      if (PHRASE_STOP_WORDS.has(word[0].trim().toLocaleLowerCase("ru"))) break;
      end += word[0].length;
      words++;
    }
    if (words === 0) continue; // "около ул. Абая" — маркер без ориентира, оставляем разбору улицы
    const number = PHRASE_NUMBER.exec(text.slice(end));
    if (number) end += number[0].length;
    spans.push({ start, end });
  }

  for (const pattern of [KAZAKH_POSTPOSITION, COURIER_NOTE]) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index + match[0].indexOf(match[1]);
      const end = match.index + match[0].length;
      if (!overlaps(start, end)) spans.push({ start, end });
    }
  }
  return spans;
}

// Ориентиры по ключевым словам ("магазин Береке"): каждый занимает слово(а) до запятой, подъезда/этажа или маркера локации.
function findKeywordLandmarks(text) {
  const keywordPattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${LANDMARK_KEYWORDS})\\s*`, "giu");
  const keywordStart = new RegExp(`(?:${LANDMARK_KEYWORDS})`, "iu");
  const stopPattern = new RegExp(
    `(?:[,;]|\\s+\\d*\\s*(?:подъезд|подьезд|подезд|подъ|этаж|эт|қабат|кв|квартира|подат|entrance|floor|flat)|\\s+\\d{1,2}(?:ый|ой)\\s*(?:этаж|floor)|\\s+${LOCATION_MARKERS}(?![\\p{L}\\p{N}]))`,
    "iu"
  );
  const spans = [];
  for (const keyword of text.matchAll(keywordPattern)) {
    const start = keyword.index + keyword[0].search(keywordStart);
    if (spans.some(span => start < span.end)) continue; // уже внутри предыдущего ориентира
    let end = start + keyword[0].trimStart().length;
    const remainder = text.slice(end);
    const stop = stopPattern.exec(remainder);
    if (stop) end += stop.index;
    else {
      const words = remainder.match(/^[\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+){0,1}/u);
      if (words) end += words[0].length;
    }
    spans.push({ start, end });
  }
  return spans;
}

function extractLandmark(text) {
  const spans = findLocationPhrases(text);
  spans.push(...findKeywordLandmarks(text));
  if (spans.length === 0) return null;

  spans.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }

  const parts = merged.map(span => trimValue(text.slice(span.start, span.end))).filter(Boolean);
  if (parts.length === 0) return null;

  let rest = text;
  for (const span of [...merged].reverse()) {
    let { start, end } = span;
    // "(возле остановки)" — вместе со скобками, чтобы в названии улицы не осталось "( )"
    const opening = /\(\s*$/u.exec(rest.slice(0, start));
    const closing = /^\s*\)/u.exec(rest.slice(end));
    if (opening && closing) {
      start -= opening[0].length;
      end += closing[0].length;
    }
    rest = `${rest.slice(0, start)} ${rest.slice(end)}`;
  }
  return { landmark: parts.join(", "), text: rest };
}

function extractLivingArea(text) {
  const patterns = [
    /(?:^|[^\p{L}\p{N}])(?:жил(?:ой|ого)\s+)?массив\s+([\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+){0,2})/iu,
    /(?:^|[^\p{L}\p{N}])(?:жк|жил(?:ой|ого)\s+комплекс)\s+([\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+){0,2})/iu
  ];
  return captureByPatterns(text, patterns);
}

function extractCatalogLivingArea(text, city) {
  const entries = city && livingAreas[city]
    ? [[city, livingAreas[city]]]
    : Object.entries(livingAreas);
  const aliases = entries.flatMap(([, names]) => names)
    .sort((a, b) => b.length - a.length);

  for (const alias of aliases) {
    const match = boundedAlias(alias).exec(text);
    if (!match) continue;
    const start = match.index + match[1].length;
    const end = start + match[2].length;
    if (trimValue(text.slice(0, start))) continue;
    const after = text.slice(end).replace(/^[\s,;|]+/u, "");
    const hasExplicitStreet = STREET_TYPES.some(({ aliases: types }) => types.some(type =>
      new RegExp(`^${escapeRegex(type).replace(/\s+/gu, "\\s*")}(?=$|[^\\p{L}\\p{N}])`, "iu").test(after)
    ));
    if (!hasExplicitStreet) continue;
    return {
      value: match[2],
      text: `${text.slice(0, match.index)} ${after}`
    };
  }
  return null;
}

function normalizeStreetName(value) {
  return value.normalize("NFKC").toLocaleLowerCase("ru")
    .replace(/[ё]/gu, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim().replace(/\s+/gu, " ");
}

function getHistoricalStreetTarget(city, streetName, streetType) {
  if (!city || !streetName) return null;
  const normalizedName = normalizeStreetName(streetName);
  const candidates = historicalStreetNames.filter(entry =>
    entry.city === city && normalizeStreetName(entry.old_name) === normalizedName
      && (!streetType || entry.old_type === streetType)
  );
  if (candidates.length !== 1) return null;

  const seen = new Set();
  let current = candidates[0];
  while (true) {
    const key = `${current.current_type}:${normalizeStreetName(current.current_name)}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const next = historicalStreetNames.filter(entry =>
      entry.city === city
      && entry.old_type === current.current_type
      && normalizeStreetName(entry.old_name) === normalizeStreetName(current.current_name)
    );
    if (next.length === 0) break;
    if (next.length > 1) return null;
    current = next[0];
  }

  return {
    city,
    street_type: current.current_type,
    street_name: current.current_name
  };
}

function makeCurrentAddress(city, street, result) {
  const parts = [
    city,
    [street.street_type, street.street_name].filter(Boolean).join(" "),
    result.house ? `дом ${result.house}` : null,
    result.apartment ? `кв. ${result.apartment}` : null,
    result.entrance ? `подъезд ${result.entrance}` : null,
    result.floor ? `этаж ${result.floor}` : null
  ].filter(Boolean);
  return {
    city,
    street_type: street.street_type,
    street_name: street.street_name,
    house: result.house,
    apartment: result.apartment,
    entrance: result.entrance,
    floor: result.floor,
    display: parts.join(", ")
  };
}

function blankResult(id, rawAddress) {
  return {
    id,
    raw_address: rawAddress,
    province: null,
    city: null,
    district: null,
    living_area: null,
    street_type: null,
    street_name: null,
    house: null,
    apartment: null,
    entrance: null,
    floor: null,
    landmark: null,
    // Сгруппированные пометки к адресу; landmark продублирован и в плоском поле — на нём построен интерфейс.
    details: { landmark: null },
    confidence: 0.05
  };
}

export function parseAddress(record) {
  const id = record && typeof record === "object" && record.id != null ? record.id : null;
  const rawAddress = typeof record === "string"
    ? record
    : record && typeof record.raw_address === "string" ? record.raw_address : "";
  const result = blankResult(id, rawAddress);
  if (!rawAddress.trim()) return result;

  // "№" до NFKC превращаем в "#": иначе он станет буквами "No" и оторвёт число от метки ("кв №5").
  let text = rawAddress.replace(/№/gu, "#").normalize("NFKC").replace(INVISIBLE, " ").replace(/[，、]/gu, ",")
    .replace(/\s+/gu, " ").trim();
  if (!text) return result;

  // Слитное написание ("Астана12дом4подъезд191кв.") разделяем правилами до любого разбора,
  // чтобы парсер работал и без LLM. raw_address остаётся нетронутым.
  const glued = splitGluedTokens(text);
  if (glued.changed) {
    text = glued.text;
    result.details.normalized_text = glued.text;
  }

  // Опечатки в городе/области ("астанй", "костанайска обл") исправляем до точного разбора.
  text = correctAdminTypos(text).text;
  text = separateAttachedCity(text).replace(
    /(^|[^\p{L}\p{N}])(көшесі|кошеси|көше|коше)(?=[\p{L}])/giu,
    "$1$2 "
  );

  const admin = matchAdmin(text);
  if (admin) {
    result.province = admin.province ?? null;
    result.city = admin.city ?? null;
    text = admin.text;
  }

  const district = detectDistrict(text, result.city);
  if (district) {
    result.district = district.district;
    text = district.text;
  }
  text = text.replace(PLACE_PREFIX, " ").replace(/қаласы/giu, " ");

  const livingArea = extractLivingArea(text) ?? extractCatalogLivingArea(text, result.city);
  if (livingArea) {
    result.living_area = trimValue(livingArea.value);
    text = livingArea.text;
  }

  // Сначала привязываем числа к меткам по цепочкам целиком ("дом 12 подъезд 4 этаж 3 кв 191"),
  // иначе жадные регулярки ниже забирают число соседней метки. Регулярки остаются запасным путём.
  const bound = bindLabeledNumbers(text);
  for (const [field, value] of Object.entries(bound.fields)) result[field] = value;
  text = bound.text;

  for (const field of ["apartment", "entrance", "floor"]) {
    if (result[field] !== null) continue;
    const detail = captureByPatterns(text, DETAIL_PATTERNS[field]);
    if (detail) {
      result[field] = detail.value;
      text = detail.text;
    }
  }

  const landmark = extractLandmark(text);
  if (landmark) {
    result.landmark = landmark.landmark;
    result.details.landmark = landmark.landmark;
    text = landmark.text;
  }

  const house = extractLabeledHouse(text);
  if (house) {
    result.house ??= house.value;
    text = house.text;
  }

  const street = extractStreet(text);
  result.street_type = street.street_type;
  result.street_name = street.street_name;
  result.living_area ??= street.living_area;
  if (street.street_type === "микрорайон" && !result.living_area) {
    result.living_area = null;
  }

  if (!result.house && street.street_name !== null) {
    const remaining = street.remaining;
    const trimmedRemaining = trimValue(remaining) ?? "";
    const attached = /(?:^|[^\p{L}\p{N}])([\p{L}][\p{L}-]*?)(\d+(?:[/\\-]\d+)*[a-zа-яё]?)$/iu.exec(trimmedRemaining);
    if (attached) {
      result.house = attached[2];
      result.street_name = trimValue(trimmedRemaining.slice(0, attached.index) + attached[1]);
    }
    const candidates = [...trimmedRemaining.matchAll(/(?:^|[^\p{L}\p{N}])(\d+(?:[/\\-]\d+)*[a-zа-яё]?)(?=$|[^\p{L}\p{N}])/giu)];
    const candidate = attached ? null : candidates.at(-1);
    if (candidate) {
      result.house = candidate[1];
      const start = candidate.index + candidate[0].indexOf(candidate[1]);
      const withoutHouse = `${trimmedRemaining.slice(0, start)} ${trimmedRemaining.slice(start + candidate[1].length)}`;
      result.street_name = trimValue(withoutHouse.split(/[,;|]/u).filter(Boolean).join(" ")) ?? street.street_name;
    }
  }

  const currentStreet = getHistoricalStreetTarget(result.city, result.street_name, result.street_type);
  if (currentStreet) result.current_address = makeCurrentAddress(result.city, currentStreet, result);

  const values = FIELD_NAMES.filter(field => result[field] !== null);
  if (values.length === 0) {
    result.confidence = 0.08;
  } else {
    const explicit = (result.city ? 0.15 : 0) + (result.province ? 0.1 : 0)
      + (result.street_name ? 0.18 : 0) + (result.house ? 0.24 : 0)
      + (result.apartment ? 0.12 : 0) + (result.entrance ? 0.08 : 0)
      + (result.floor ? 0.05 : 0) + (result.district ? 0.08 : 0)
      + (result.living_area ? 0.05 : 0) + (result.landmark ? 0.04 : 0);
    result.confidence = Math.max(0.2, Math.min(0.99, Number((0.25 + explicit).toFixed(2))));
  }

  return result;
}

export function parseBatch(records) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  return records.map(parseAddress);
}
