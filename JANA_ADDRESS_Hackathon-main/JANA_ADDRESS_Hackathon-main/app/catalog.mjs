import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAdminFuzzy, createFuzzyMatcher } from "./fuzzy-address.mjs";
import { openCatalogStore } from "./catalog-db.mjs";

export const regions = [
  { name: "Абайская область", aliases: ["Абайская область", "Абай обл", "Абай облысы"] },
  { name: "Акмолинская область", aliases: ["Акмолинская область", "Акмола обл", "Ақмола облысы"] },
  { name: "Актюбинская область", aliases: ["Актюбинская область", "Актобе обл", "Ақтөбе облысы"] },
  { name: "Алматинская область", aliases: ["Алматинская область", "Алматинская обл", "Алматы облысы"] },
  { name: "Атырауская область", aliases: ["Атырауская область", "Атырау обл", "Атырау облысы"] },
  { name: "Восточно-Казахстанская область", aliases: ["Восточно-Казахстанская область", "ВКО", "Шығыс Қазақстан облысы"] },
  { name: "Жамбылская область", aliases: ["Жамбылская область", "Жамбыл обл", "Жамбыл облысы"] },
  { name: "Область Жетісу", aliases: ["Область Жетісу", "Жетісу облысы", "Жетысуская область"] },
  { name: "Западно-Казахстанская область", aliases: ["Западно-Казахстанская область", "ЗКО", "Батыс Қазақстан облысы"] },
  { name: "Карагандинская область", aliases: ["Карагандинская область", "Караганда обл", "Қарағанды облысы"] },
  { name: "Костанайская область", aliases: ["Костанайская область", "Костанай обл", "Қостанай облысы"] },
  { name: "Кызылординская область", aliases: ["Кызылординская область", "Кызылорда обл", "Қызылорда облысы"] },
  { name: "Мангистауская область", aliases: ["Мангистауская область", "Мангистау обл", "Маңғыстау облысы"] },
  { name: "Павлодарская область", aliases: ["Павлодарская область", "Павлодар обл", "Павлодар облысы"] },
  { name: "Северо-Казахстанская область", aliases: ["Северо-Казахстанская область", "СКО", "Солтүстік Қазақстан облысы"] },
  { name: "Туркестанская область", aliases: ["Туркестанская область", "Туркестан обл", "Түркістан облысы", "Южно-Казахстанская область", "ЮКО"] },
  { name: "Область Ұлытау", aliases: ["Область Ұлытау", "Ұлытау облысы", "Улытауская область"] }
];

export const cities = [
  ["Астана", ["Астана", "Нур-Султан", "Нұр-Сұлтан"], "Астана"],
  ["Алматы", ["Алматы", "Алма-Ата"], "Алматы"],
  ["Шымкент", ["Шымкент", "Чимкент"], "Шымкент"],
  ["Абай", ["Абай"], "Карагандинская область"],
  ["Акколь", ["Акколь", "Ақкөл"], "Акмолинская область"],
  ["Аксай", ["Аксай", "Ақcай"], "Западно-Казахстанская область"],
  ["Аксу", ["Аксу", "Ақсу"], "Павлодарская область"],
  ["Актау", ["Актау", "Ақтау"], "Мангистауская область"],
  ["Актобе", ["Актобе", "Ақтөбе"], "Актюбинская область"],
  ["Алтай", ["Алтай", "Зыряновск"], "Восточно-Казахстанская область"],
  ["Аральск", ["Аральск", "Арал"], "Кызылординская область"],
  ["Аркалык", ["Аркалык", "Арқалық"], "Костанайская область"],
  ["Арыс", ["Арыс"], "Туркестанская область"],
  ["Атбасар", ["Атбасар"], "Акмолинская область"],
  ["Атырау", ["Атырау", "Гурьев"], "Атырауская область"],
  ["Балхаш", ["Балхаш"], "Карагандинская область"],
  ["Булаево", ["Булаево"], "Северо-Казахстанская область"],
  ["Державинск", ["Державинск"], "Акмолинская область"],
  ["Ерейментау", ["Ерейментау"], "Акмолинская область"],
  ["Есик", ["Есик", "Иссык"], "Алматинская область"],
  ["Жанаозен", ["Жанаозен", "Жаңаөзен"], "Мангистауская область"],
  ["Жаркент", ["Жаркент"], "Область Жетісу"],
  ["Жезказган", ["Жезказган", "Жезқазған"], "Область Ұлытау"],
  ["Жем", ["Жем"], "Актюбинская область"],
  ["Жетысай", ["Жетысай", "Жетісай"], "Туркестанская область"],
  ["Зайсан", ["Зайсан"], "Восточно-Казахстанская область"],
  ["Кандыагаш", ["Кандыагаш", "Қандыағаш"], "Актюбинская область"],
  ["Караганда", ["Караганда", "Қарағанды"], "Карагандинская область"],
  ["Каражал", ["Каражал"], "Область Ұлытау"],
  ["Каратау", ["Каратау"], "Жамбылская область"],
  ["Каркаралинск", ["Каркаралинск"], "Карагандинская область"],
  ["Каскелен", ["Каскелен"], "Алматинская область"],
  ["Кентау", ["Кентау"], "Туркестанская область"],
  ["Кокшетау", ["Кокшетау", "Көкшетау"], "Акмолинская область"],
  ["Конаев", ["Konaev", "Қонаев", "Капчагай"], "Алматинская область"],
  ["Костанай", ["Костанай", "Қостанай"], "Костанайская область"],
  ["Кульсары", ["Кульсары", "Құлсары"], "Атырауская область"],
  ["Курчатов", ["Курчатов"], "Область Абай"],
  ["Кызылорда", ["Кызылорда", "Кзыл-Орда"], "Кызылординская область"],
  ["Ленгер", ["Ленгер"], "Туркестанская область"],
  ["Лисаковск", ["Лисаковск"], "Костанайская область"],
  ["Макинск", ["Макинск"], "Акмолинская область"],
  ["Павлодар", ["Павлодар"], "Павлодарская область"],
  ["Петропавловск", ["Петропавловск", "Петропавл"], "Северо-Казахстанская область"],
  ["Риддер", ["Риддер"], "Восточно-Казахстанская область"],
  ["Рудный", ["Рудный"], "Костанайская область"],
  ["Сарань", ["Сарань"], "Карагандинская область"],
  ["Сарканд", ["Сарканд"], "Область Жетісу"],
  ["Сатпаев", ["Сатпаев", "Сәтбаев"], "Область Ұлытау"],
  ["Семей", ["Семей", "Семипалатинск"], "Абайская область"],
  ["Степногорск", ["Степногорск"], "Акмолинская область"],
  ["Тайынша", ["Тайынша"], "Северо-Казахстанская область"],
  ["Талгар", ["Талгар"], "Алматинская область"],
  ["Талдыкорган", ["Талдыкорган", "Талдықорған"], "Область Жетісу"],
  ["Тараз", ["Тараз", "Джамбул"], "Жамбылская область"],
  ["Текели", ["Текели"], "Область Жетісу"],
  ["Темир", ["Темир"], "Актюбинская область"],
  ["Темиртау", ["Темиртау", "Теміртау"], "Карагандинская область"],
  ["Туркестан", ["Туркестан", "Түркістан"], "Туркестанская область"],
  ["Уральск", ["Уральск", "Орал"], "Западно-Казахстанская область"],
  ["Усть-Каменогорск", ["Усть-Каменогорск", "Өскемен"], "Восточно-Казахстанская область"],
  ["Ушарал", ["Ушарал"], "Область Жетісу"],
  ["Шалкар", ["Шалкар"], "Актюбинская область"],
  ["Шар", ["Шар"], "Абайская область"],
  ["Шахтинск", ["Шахтинск"], "Карагандинская область"],
  ["Щучинск", ["Щучинск"], "Акмолинская область"],
  ["Экибастуз", ["Экибастуз", "Екібастұз"], "Павлодарская область"]
].map(([name, aliases, province]) => ({ name, aliases, province }));

export const urbanDistricts = {
  Алматы: ["Алатауский", "Алмалинский", "Ауэзовский", "Бостандыкский", "Жетысуский", "Медеуский", "Наурызбайский", "Турксибский"],
  Астана: ["Алматинский", "Байконурский", "Есильский", "Нуринский", "Сарайшыкский", "Сарыаркинский"],
  Шымкент: ["Абайский", "Аль-Фарабийский", "Енбекшинский", "Каратауский", "Туранский"],
  Караганда: ["Казыбекбийский", "Октябрьский"]
};

export const livingAreas = {};
export const historicalStreetNames = [];

function readOptionalReference() {
  const dataDirectory = resolve(process.env.DATA_DIR ?? fileURLToPath(new URL("../data", import.meta.url)));
  const referencePath = resolve(dataDirectory, "reference.json");
  if (!existsSync(referencePath)) return;

  const reference = JSON.parse(readFileSync(referencePath, "utf8"));
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
    throw new TypeError("data/reference.json must contain a JSON object");
  }

  for (const region of reference.regions ?? []) {
    if (!region || typeof region.name !== "string" || !Array.isArray(region.aliases)
      || !region.aliases.every(alias => typeof alias === "string")) {
      throw new TypeError("Every reference region must have a name and aliases array");
    }
    const existing = regions.find(entry => entry.name === region.name);
    if (existing) existing.aliases = [...new Set([...existing.aliases, ...region.aliases])];
    else regions.push({ name: region.name, aliases: region.aliases });
  }

  for (const city of reference.cities ?? []) {
    if (!city || typeof city.name !== "string" || typeof city.province !== "string"
      || !Array.isArray(city.aliases) || !city.aliases.every(alias => typeof alias === "string")) {
      throw new TypeError("Every reference city must have name, province and aliases array");
    }
    const existing = cities.find(entry => entry.name === city.name);
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, ...city.aliases])];
      existing.province = city.province;
    } else {
      cities.push({ name: city.name, aliases: city.aliases, province: city.province });
    }
  }

  for (const [city, districts] of Object.entries(reference.urbanDistricts ?? {})) {
    if (!Array.isArray(districts) || !districts.every(district => typeof district === "string")) {
      throw new TypeError(`Reference districts for ${city} must be an array of names`);
    }
    urbanDistricts[city] = [...new Set([...(urbanDistricts[city] ?? []), ...districts])];
  }

  for (const [city, areas] of Object.entries(reference.livingAreas ?? {})) {
    if (!Array.isArray(areas) || !areas.every(area => typeof area === "string")) {
      throw new TypeError(`Reference living areas for ${city} must be an array of names`);
    }
    livingAreas[city] = [...new Set([...(livingAreas[city] ?? []), ...areas])];
  }

  for (const entry of reference.historicalStreetNames ?? []) {
    if (!entry || typeof entry.city !== "string"
      || typeof entry.old_name !== "string" || typeof entry.old_type !== "string"
      || typeof entry.current_name !== "string" || typeof entry.current_type !== "string"
      || !entry.city.trim() || !entry.old_name.trim() || !entry.current_name.trim()
      || !entry.old_type.trim() || !entry.current_type.trim()) {
      throw new TypeError("Every historical street name must include city, old/current names and old/current types");
    }
    if (!cities.some(city => city.name === entry.city)) {
      throw new TypeError(`Unknown city "${entry.city}" in a historical street mapping`);
    }
    historicalStreetNames.push({
      city: entry.city.trim(),
      old_name: entry.old_name.trim(),
      old_type: entry.old_type.trim(),
      current_name: entry.current_name.trim(),
      current_type: entry.current_type.trim()
    });
  }
}

readOptionalReference();

const catalogDbPath = process.env.CATALOG_DB
  ?? resolve(process.env.DATA_DIR ?? fileURLToPath(new URL("../data", import.meta.url)), "catalog.sqlite");

export const catalogStore = openCatalogStore(
  { regions, cities, urbanDistricts, livingAreas, historicalStreetNames },
  { path: catalogDbPath }
);

export const findCity = query => catalogStore.matchers.city.find(query);
export const findRegion = query => catalogStore.matchers.region.find(query);
// Нечёткий поиск опечаток в городе/области (раньше здесь были заглушки, из-за чего parseAddress падал).
const adminFuzzy = createAdminFuzzy(cities, regions);
export const fuzzyAdminMentions = text => adminFuzzy.fuzzyAdminMentions(text);
export const correctAdminTypos = text => adminFuzzy.correctAdminTypos(text);

export const getRegion = name => catalogStore.getRegion(name);
export const getCity = name => catalogStore.getCity(name);
export const listRegions = () => catalogStore.listRegions();
export const citiesInProvince = province => catalogStore.citiesInProvince(province);
export const provinceOfCity = name => catalogStore.provinceOfCity(name);
export const isKnownCity = name => catalogStore.getCity(name) !== null;
export const isKnownRegion = name => catalogStore.getRegion(name) !== null;
export const isCityInProvince = (city, province) => catalogStore.isCityInProvince(city, province);
export const districtsOf = city => catalogStore.districtsOf(city);
export const livingAreasOf = city => catalogStore.livingAreasOf(city);
export const findDistrict = (query, city) => catalogStore.findDistrict(query, city);
export const findLivingArea = (query, city) => catalogStore.findLivingArea(query, city);
export const historicalStreets = (city, oldName) => catalogStore.historicalStreets(city, oldName);

export function catalogSummary() {
  return {
    ...catalogStore.counts(),
    source: "Встроенный автономный справочник с локальными дополнениями из data/reference.json.",
    storage: catalogStore.engine
  };
}