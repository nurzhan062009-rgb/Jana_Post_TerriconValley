import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createFuzzyMatcher, matchKey, STOP_WORDS } from "./fuzzy-address.mjs";

const SCHEMA_VERSION = 1;
const DISTRICT_STOP_WORDS = new Set([...STOP_WORDS, "район", "р", "н", "аудан"]);
const districtKey = value => matchKey(value, DISTRICT_STOP_WORDS);

const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE regions (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE region_aliases (
  region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  alias     TEXT NOT NULL,
  key       TEXT NOT NULL,
  len       INTEGER NOT NULL,
  PRIMARY KEY (region_id, alias)
);
CREATE INDEX idx_region_aliases_key ON region_aliases(key);
CREATE INDEX idx_region_aliases_len ON region_aliases(len);

CREATE TABLE cities (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  province TEXT NOT NULL
);
CREATE INDEX idx_cities_province ON cities(province);
CREATE TABLE city_aliases (
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  alias   TEXT NOT NULL,
  key     TEXT NOT NULL,
  len     INTEGER NOT NULL,
  PRIMARY KEY (city_id, alias)
);
CREATE INDEX idx_city_aliases_key ON city_aliases(key);
CREATE INDEX idx_city_aliases_len ON city_aliases(len);

CREATE TABLE districts (
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  key  TEXT NOT NULL,
  ord  INTEGER NOT NULL,
  PRIMARY KEY (city, name)
);
CREATE INDEX idx_districts_key ON districts(key);

CREATE TABLE living_areas (
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  key  TEXT NOT NULL,
  ord  INTEGER NOT NULL,
  PRIMARY KEY (city, name)
);
CREATE INDEX idx_living_areas_key ON living_areas(key);

CREATE TABLE historical_street_names (
  id           INTEGER PRIMARY KEY,
  city         TEXT NOT NULL,
  old_name     TEXT NOT NULL,
  old_type     TEXT NOT NULL,
  current_name TEXT NOT NULL,
  current_type TEXT NOT NULL,
  old_key      TEXT NOT NULL
);
CREATE INDEX idx_historical_city_key ON historical_street_names(city, old_key);
`;

const TABLES = [
  "historical_street_names", "living_areas", "districts",
  "city_aliases", "cities", "region_aliases", "regions", "meta"
];

function loadSqlite() {
  try {
    return process.getBuiltinModule?.("node:sqlite") ?? null;
  } catch {
    return null;
  }
}

function fingerprint(snapshot) {
  return createHash("sha256").update(JSON.stringify([SCHEMA_VERSION, snapshot])).digest("hex");
}

function aliasRows(entry) {
  const rows = [];
  for (const alias of new Set([entry.name, ...(entry.aliases ?? [])])) {
    const key = matchKey(alias);
    if (key) rows.push([alias, key, key.length]);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------------

function readFingerprint(db) {
  try {
    return db.prepare("SELECT value FROM meta WHERE key = 'fingerprint'").get()?.value ?? null;
  } catch {
    return null; // таблицы meta ещё нет
  }
}

function migrate(db, snapshot) {
  const wanted = fingerprint(snapshot);
  if (readFingerprint(db) === wanted) return false;

  db.exec("BEGIN IMMEDIATE");
  try {
    // Другой процесс мог успеть сделать то же самое, пока мы ждали блокировку.
    if (readFingerprint(db) === wanted) {
      db.exec("COMMIT");
      return false;
    }

    for (const table of TABLES) db.exec(`DROP TABLE IF EXISTS ${table}`);
    db.exec(SCHEMA);

    const addRegion = db.prepare("INSERT INTO regions(name) VALUES (?) ON CONFLICT(name) DO NOTHING");
    const regionId = db.prepare("SELECT id FROM regions WHERE name = ?");
    const addRegionAlias = db.prepare("INSERT OR IGNORE INTO region_aliases(region_id, alias, key, len) VALUES (?, ?, ?, ?)");
    for (const region of snapshot.regions) {
      addRegion.run(region.name);
      const id = regionId.get(region.name).id;
      for (const row of aliasRows(region)) addRegionAlias.run(id, ...row);
    }

    const addCity = db.prepare("INSERT INTO cities(name, province) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET province = excluded.province");
    const cityId = db.prepare("SELECT id FROM cities WHERE name = ?");
    const addCityAlias = db.prepare("INSERT OR IGNORE INTO city_aliases(city_id, alias, key, len) VALUES (?, ?, ?, ?)");
    for (const city of snapshot.cities) {
      addCity.run(city.name, city.province);
      const id = cityId.get(city.name).id;
      for (const row of aliasRows(city)) addCityAlias.run(id, ...row);
    }

    for (const [table, source] of [["districts", snapshot.urbanDistricts], ["living_areas", snapshot.livingAreas]]) {
      const add = db.prepare(`INSERT OR IGNORE INTO ${table}(city, name, key, ord) VALUES (?, ?, ?, ?)`);
      for (const [city, names] of Object.entries(source)) {
        names.forEach((name, ord) => add.run(city, name, districtKey(name), ord));
      }
    }

    const addHistorical = db.prepare(
      "INSERT INTO historical_street_names(city, old_name, old_type, current_name, current_type, old_key) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const entry of snapshot.historicalStreetNames) {
      addHistorical.run(entry.city, entry.old_name, entry.old_type, entry.current_name, entry.current_type, matchKey(entry.old_name));
    }

    db.prepare("INSERT INTO meta(key, value) VALUES ('fingerprint', ?), ('schema_version', ?)")
      .run(wanted, String(SCHEMA_VERSION));
    db.exec("COMMIT");
    return true;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* транзакция уже закрыта */ }
    throw error;
  }
}

function openDatabase(sqlite, path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new sqlite.DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") {
    try { db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL"); } catch { /* ФС без WAL — не критично */ }
  }
  return db;
}

function createSqliteStore(db, rebuilt, path) {
  const sql = text => db.prepare(text);
  const q = {
    regionExact: sql("SELECT r.id, r.name, a.alias FROM region_aliases a JOIN regions r ON r.id = a.region_id WHERE a.key = ? ORDER BY r.id"),
    regionNear: sql("SELECT r.id, r.name, a.alias, a.key FROM region_aliases a JOIN regions r ON r.id = a.region_id WHERE a.len BETWEEN ? AND ? ORDER BY r.id"),
    cityExact: sql("SELECT c.id, c.name, c.province, a.alias FROM city_aliases a JOIN cities c ON c.id = a.city_id WHERE a.key = ? ORDER BY c.id"),
    cityNear: sql("SELECT c.id, c.name, c.province, a.alias, a.key FROM city_aliases a JOIN cities c ON c.id = a.city_id WHERE a.len BETWEEN ? AND ? ORDER BY c.id"),
    region: sql("SELECT id, name FROM regions WHERE name = ?"),
    regionAliases: sql("SELECT alias FROM region_aliases WHERE region_id = ? ORDER BY rowid"),
    regions: sql("SELECT name FROM regions ORDER BY id"),
    city: sql("SELECT id, name, province FROM cities WHERE name = ?"),
    cityAliases: sql("SELECT alias FROM city_aliases WHERE city_id = ? ORDER BY rowid"),
    citiesInProvince: sql("SELECT name FROM cities WHERE province = ? ORDER BY id"),
    cityInProvince: sql("SELECT 1 AS ok FROM cities WHERE name = ? AND province = ?"),
    districts: sql("SELECT name FROM districts WHERE city = ? ORDER BY ord"),
    districtByKey: sql("SELECT city, name FROM districts WHERE key = ? ORDER BY city, ord"),
    districtByKeyInCity: sql("SELECT city, name FROM districts WHERE key = ? AND city = ? ORDER BY ord"),
    livingAreas: sql("SELECT name FROM living_areas WHERE city = ? ORDER BY ord"),
    livingAreaByKey: sql("SELECT city, name FROM living_areas WHERE key = ? ORDER BY city, ord"),
    livingAreaByKeyInCity: sql("SELECT city, name FROM living_areas WHERE key = ? AND city = ? ORDER BY ord"),
    historical: sql("SELECT city, old_name, old_type, current_name, current_type FROM historical_street_names WHERE city = ? ORDER BY id"),
    historicalByName: sql("SELECT city, old_name, old_type, current_name, current_type FROM historical_street_names WHERE city = ? AND old_key = ? ORDER BY id"),
    count: name => sql(`SELECT COUNT(*) AS n FROM ${name}`)
  };
  const plain = rows => rows.map(row => ({ ...row }));
  const names = rows => rows.map(row => row.name);

  const cityMatcher = createFuzzyMatcher(q.cityExact.all("").map(r => ({ name: r.name, province: r.province }))); // Используем стандартный матчер через fuzzy
  const regionMatcher = createFuzzyMatcher(q.regionExact.all("").map(r => ({ name: r.name })));

  return {
    engine: "sqlite",
    path,
    rebuilt,
    matchers: { city: cityMatcher, region: regionMatcher },

    getRegion(name) {
      const row = q.region.get(name);
      return row ? { name: row.name, aliases: q.regionAliases.all(row.id).map(r => r.alias) } : null;
    },
    getCity(name) {
      const row = q.city.get(name);
      return row ? { name: row.name, province: row.province, aliases: q.cityAliases.all(row.id).map(r => r.alias) } : null;
    },
    listRegions: () => names(q.regions.all()),
    citiesInProvince: province => names(q.citiesInProvince.all(province)),
    provinceOfCity: name => q.city.get(name)?.province ?? null,
    isCityInProvince: (city, province) => Boolean(q.cityInProvince.get(city, province)),
    districtsOf: city => names(q.districts.all(city)),
    livingAreasOf: city => names(q.livingAreas.all(city)),
    findDistrict: (query, city) => plain(city == null
      ? q.districtByKey.all(districtKey(query))
      : q.districtByKeyInCity.all(districtKey(query), city)),
    findLivingArea: (query, city) => plain(city == null
      ? q.livingAreaByKey.all(districtKey(query))
      : q.livingAreaByKeyInCity.all(districtKey(query), city)),
    historicalStreets: (city, oldName) => plain(oldName == null
      ? q.historical.all(city)
      : q.historicalByName.all(city, matchKey(oldName))),
    counts: () => ({
      regions: q.count("regions").get().n,
      cities: q.count("cities").get().n,
      urbanDistricts: q.count("districts").get().n,
      livingAreas: q.count("living_areas").get().n,
      historicalStreetNames: q.count("historical_street_names").get().n
    }),
    close: () => db.close()
  };
}

// ---------------------------------------------------------------------------
// Запасной вариант: то же API поверх массивов
// ---------------------------------------------------------------------------

function createMemoryStore(snapshot, reason = null) {
  const { regions, cities, urbanDistricts, livingAreas, historicalStreetNames } = snapshot;
  const byKey = (source, query, city) => Object.entries(source)
    .filter(([owner]) => city == null || owner === city)
    .flatMap(([owner, list]) => list.filter(name => districtKey(name) === districtKey(query)).map(name => ({ city: owner, name })))
    .sort((a, b) => (a.city < b.city ? -1 : a.city > b.city ? 1 : 0));
  const historicalOf = city => historicalStreetNames.filter(entry => entry.city === city)
    .map(({ city: owner, old_name, old_type, current_name, current_type }) => ({ city: owner, old_name, old_type, current_name, current_type }));

  return {
    engine: "memory",
    path: null,
    rebuilt: false,
    reason,
    matchers: { city: createFuzzyMatcher(cities), region: createFuzzyMatcher(regions) },

    getRegion: name => regions.find(region => region.name === name) ?? null,
    getCity: name => cities.find(city => city.name === name) ?? null,
    listRegions: () => regions.map(region => region.name),
    citiesInProvince: province => cities.filter(city => city.province === province).map(city => city.name),
    provinceOfCity: name => cities.find(city => city.name === name)?.province ?? null,
    isCityInProvince: (city, province) => cities.some(entry => entry.name === city && entry.province === province),
    districtsOf: city => [...(urbanDistricts[city] ?? [])],
    livingAreasOf: city => [...(livingAreas[city] ?? [])],
    findDistrict: (query, city) => byKey(urbanDistricts, query, city),
    findLivingArea: (query, city) => byKey(livingAreas, query, city),
    historicalStreets: (city, oldName) => historicalOf(city)
      .filter(entry => oldName == null || matchKey(entry.old_name) === matchKey(oldName)),
    counts: () => ({
      regions: regions.length,
      cities: cities.length,
      urbanDistricts: Object.values(urbanDistricts).flat().length,
      livingAreas: Object.values(livingAreas).flat().length,
      historicalStreetNames: historicalStreetNames.length
    }),
    close() {}
  };
}

export function openCatalogStore(snapshot, { path, logger = console } = {}) {
  if (path === "off") return createMemoryStore(snapshot, "отключено настройкой CATALOG_DB=off");

  const sqlite = loadSqlite();
  if (!sqlite?.DatabaseSync) {
    return createMemoryStore(snapshot, "node:sqlite недоступен (нужен Node.js 22.5+)");
  }

  for (const target of path === ":memory:" ? [":memory:"] : [path, ":memory:"]) {
    let db;
    try {
      db = openDatabase(sqlite, target);
      const rebuilt = migrate(db, snapshot);
      return createSqliteStore(db, rebuilt, target);
    } catch (error) {
      try { db?.close(); } catch { /* ignore */ }
      logger.warn?.(`[catalog] SQLite (${target}) недоступен: ${error.message}`
        + (target === path && target !== ":memory:" ? " — используется база в памяти; файл можно удалить, он пересоздастся." : ""));
    }
  }
  return createMemoryStore(snapshot, "не удалось открыть базу SQLite");
}