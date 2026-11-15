import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openCatalogStore } from "../app/catalog-db.mjs";
import * as catalog from "../app/catalog.mjs";

const quiet = { warn() {} };
const base = {
  regions: catalog.regions,
  cities: catalog.cities,
  urbanDistricts: catalog.urbanDistricts,
  livingAreas: { Астана: ["Нура", "Самал"], Алматы: ["Орбита", "Самал"] },
  historicalStreetNames: [
    { city: "Алматы", old_name: "Кирова", old_type: "улица", current_name: "Шевченко", current_type: "улица" }
  ]
};

const sqlite = () => openCatalogStore(base, { path: ":memory:", logger: quiet });
const memory = () => openCatalogStore(base, { path: "off" });

test("миграция переносит все таблицы", () => {
  const store = sqlite();
  assert.equal(store.engine, "sqlite");
  assert.deepEqual(store.counts(), {
    regions: base.regions.length,
    cities: base.cities.length,
    urbanDistricts: Object.values(base.urbanDistricts).flat().length,
    livingAreas: 4,
    historicalStreetNames: 1
  });
  assert.deepEqual(store.getCity("Усть-Каменогорск").aliases, ["Усть-Каменогорск", "Өскемен"]);
  assert.equal(store.provinceOfCity("Семей"), "Абайская область");
  assert.deepEqual(store.districtsOf("Астана"), base.urbanDistricts.Астана);
  assert.deepEqual(store.livingAreasOf("Алматы"), ["Орбита", "Самал"]);
  store.close();
});

test("SQLite и запасной режим дают одинаковые ответы", () => {
  const a = sqlite();
  const b = memory();
  const names = ["Астана", "Нур-Султан", "Қостанай", "Алма-Ата", "Нет такого"];
  for (const name of names) {
    assert.equal(a.matchers.city.find(name)?.entry.name ?? null, b.matchers.city.find(name)?.entry.name ?? null, name);
  }
  assert.deepEqual(a.citiesInProvince("Костанайская область"), b.citiesInProvince("Костанайская область"));
  assert.equal(a.isCityInProvince("Рудный", "Костанайская область"), true);
  assert.equal(a.isCityInProvince("Рудный", "Алматы"), false);
  assert.equal(b.isCityInProvince("Рудный", "Костанайская область"), true);
  assert.deepEqual(a.findDistrict("алмалинский район"), b.findDistrict("алмалинский район"));
  assert.deepEqual(a.findDistrict("Алмалинский", "Астана"), []);
  assert.deepEqual(a.findLivingArea("самал"), b.findLivingArea("самал"));
  assert.deepEqual(a.historicalStreets("Алматы", "кирова"), b.historicalStreets("Алматы", "кирова"));
  assert.deepEqual(a.counts(), b.counts());

  // все одиночные опечатки: оба движка отвечают одинаково
  for (const city of base.cities.filter(city => city.name.length >= 5)) {
    const w = city.name.toLowerCase();
    for (const typo of [w.slice(1), w.slice(0, -1), w + w.at(-1), w[1] + w[0] + w.slice(2)]) {
      assert.equal(a.matchers.city.find(typo)?.entry.name ?? null, b.matchers.city.find(typo)?.entry.name ?? null, typo);
    }
  }
});

test("база обновляется только при изменении справочника", () => {
  const dir = mkdtempSync(join(tmpdir(), "jana-catalog-"));
  const path = join(dir, "catalog.sqlite");
  try {
    const first = openCatalogStore(base, { path });
    assert.equal(first.rebuilt, true);
    first.close();

    const second = openCatalogStore(base, { path });
    assert.equal(second.rebuilt, false);
    assert.equal(second.getCity("Шымкент").province, "Шымкент");
    second.close();

    const changed = { ...base, cities: [...base.cities, { name: "Новоград", aliases: ["Новоград"], province: "Акмолинская область" }] };
    const third = openCatalogStore(changed, { path });
    assert.equal(third.rebuilt, true);
    assert.equal(third.matchers.city.find("новогрд")?.entry.name, "Новоград");
    third.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("битый файл или отсутствие SQLite не ломают запуск", () => {
  const dir = mkdtempSync(join(tmpdir(), "jana-catalog-"));
  const path = join(dir, "broken.sqlite");
  try {
    writeFileSync(path, "это не база данных, это текст".repeat(50));
    const warnings = [];
    const store = openCatalogStore(base, { path, logger: { warn: message => warnings.push(message) } });
    assert.equal(store.getCity("Астана").name, "Астана");
    assert.ok(warnings.length >= 1);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(memory().engine, "memory");
});

test("обратная совместимость catalog.mjs", () => {
  for (const name of ["regions", "cities"]) assert.ok(Array.isArray(catalog[name]) && catalog[name].length > 10, name);
  assert.ok(Array.isArray(catalog.historicalStreetNames));
  assert.equal(typeof catalog.urbanDistricts, "object");
  assert.equal(typeof catalog.livingAreas, "object");
  const summary = catalog.catalogSummary();
  for (const key of ["regions", "cities", "urbanDistricts", "livingAreas", "historicalStreetNames", "source"]) assert.ok(key in summary, key);
  assert.equal(summary.cities, catalog.cities.length);
  assert.equal(summary.urbanDistricts, Object.values(catalog.urbanDistricts).flat().length);
  assert.equal(catalog.findCity("астанй").entry.name, "Астана");
  assert.equal(catalog.correctAdminTypos("костанайй, Победы 10").text, "Костанай, Победы 10");
  assert.equal(catalog.isKnownCity("Астана"), true);
  assert.equal(catalog.isKnownCity("Астанй"), false);
});
