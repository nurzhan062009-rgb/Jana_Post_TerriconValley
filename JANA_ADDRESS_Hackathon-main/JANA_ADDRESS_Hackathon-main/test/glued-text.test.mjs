// Тесты на слитное написание: app/normalize.mjs (расстановка пробелов на стыках) и
// app/labels.mjs (привязка чисел к меткам) + их работа внутри parseAddress. Всё без LLM.
// Запуск: npm test  (или node --test test/glued-text.test.mjs)

import assert from "node:assert/strict";
import test, { describe } from "node:test";

process.env.CATALOG_DB ??= ":memory:";
const { splitGluedTokens } = await import("../app/normalize.mjs");
const { bindLabeledNumbers } = await import("../app/labels.mjs");
const { parseAddress } = await import("../app/parser.mjs");

const FIELDS = [
  "province", "city", "district", "living_area", "street_type", "street_name",
  "house", "apartment", "entrance", "floor", "landmark"
];
const EMPTY = Object.freeze(Object.fromEntries(FIELDS.map(field => [field, null])));
const full = expected => ({ ...EMPTY, ...expected });
const parse = raw => {
  const result = parseAddress(raw);
  return Object.fromEntries(FIELDS.map(field => [field, result[field]]));
};
const split = raw => splitGluedTokens(raw).text;

const ASTANA = { province: "Астана", city: "Астана" };
const ALMATY = { province: "Алматы", city: "Алматы" };

describe("splitGluedTokens: стыки токенов", () => {
  const cases = [
    ["слово+число+ключевые слова", "Астана12дом4подъезд191кв.", "Астана 12 дом 4 подъезд 191 кв."],
    ["число+ключевое слово", "66квартал 12дом 69квартира", "66 квартал 12 дом 69 квартира"],
    ["ключевое слово+число", "дом12подъезд4этаж3кв191", "дом 12 подъезд 4 этаж 3 кв 191"],
    ["слово+число без ключевых слов", "Назарбаева8", "Назарбаева 8"],
    ["латиница", "flat191 Abay5kv12", "flat 191 Abay 5 kv 12"],
    ["неправильное «подьезд»", "4подьезд239кв", "4 подьезд 239 кв"],
    ["дробь и ключевое слово", "Абая 1/2кв7", "Абая 1/2 кв 7"],
    ["сокращение с точкой и пробелом перед ней", "Ул .Курильская9кв1", "Ул. Курильская 9 кв 1"],
    ["сокращения без пробелов", "г.Алматы,ул.Абая5кв.12", "г. Алматы, ул. Абая 5 кв. 12"],
    ["запятая без пробела", "Астана,Абая 5", "Астана, Абая 5"],
    ["знак номера", "дом#5кв#3", "дом #5 кв #3"],
    ["ориентир после числа", "5аптека", "5 аптека"],
    ["микрорайон слитно", "11мкр 5дом", "11 мкр 5 дом"],
    ["казахские метки", "12үй4кіреберіс", "12 үй 4 кіреберіс"]
  ];
  for (const [title, input, expected] of cases) {
    test(title, () => assert.equal(split(input), expected));
  }
});

describe("splitGluedTokens: чего резать нельзя", () => {
  const untouched = [
    ["литера дома", "Абая 12а"],
    ["дробь дома", "Абая 55/6"],
    ["одиночное «д» — это литера, а не «дом»", "Абая 12д"],
    ["слово, лишь начинающееся как ключевое", "5квази"],
    ["слово на «кв» без цифры рядом", "квазар"],
    ["номер микрорайона с литерой", "Аксай 3а"],
    ["одна буква перед цифрой — это код, а не слово", "блок А5"],
    ["уже нормальный адрес", "город Алматы, ул. Абая 55/6, кв. 191, 3 подъезд, 5 этаж"]
  ];
  for (const [title, input] of untouched) {
    test(title, () => {
      const result = splitGluedTokens(input);
      assert.equal(result.text, input);
      assert.equal(result.changed, false);
    });
  }

  test("идемпотентность: повторный прогон ничего не меняет", () => {
    for (const input of ["Астана12дом4подъезд191кв.", "Ул .Курильская9кв1", "дом№5кв№3", "Алматы,Абая5кв2подъезд1"]) {
      const once = split(input);
      assert.equal(split(once), once, input);
    }
  });

  test("null/пустая строка не падают", () => {
    assert.equal(split(""), "");
    assert.equal(split(null), "");
    assert.equal(splitGluedTokens("Абая 5").changed, false);
  });

  test("счётчик применённых правил", () => {
    const { applied, changed } = splitGluedTokens("Астана12дом");
    assert.equal(changed, true);
    assert.equal(applied["word+number"], 1);
    assert.equal(applied["number+keyword"], 1);
  });
});

describe("bindLabeledNumbers: числа и метки", () => {
  const fields = text => bindLabeledNumbers(text).fields;

  test("метка → число", () => {
    assert.deepEqual(fields("дом 12 подъезд 4 этаж 3 кв 191"), { house: "12", entrance: "4", floor: "3", apartment: "191" });
  });

  test("число → метка", () => {
    assert.deepEqual(fields("12 дом 4 подъезд 3 этаж 191 кв"), { house: "12", entrance: "4", floor: "3", apartment: "191" });
  });

  test("смешанные стили в одной строке", () => {
    assert.deepEqual(fields("1/2, кв. 191, 3 подъезд, 5 этаж"), { apartment: "191", entrance: "3", floor: "5" });
  });

  test("число перед цепочкой остаётся номером дома, а не уходит метке", () => {
    const { fields: bound, text } = bindLabeledNumbers("Абая 18 подъезд 2");
    assert.deepEqual(bound, { entrance: "2" });
    assert.match(text, /18/u);
  });

  test("метка без числа не ломает остальные", () => {
    assert.deepEqual(fields("подъезд кв 5"), { apartment: "5" });
  });

  test("дробь и литера сохраняются", () => {
    assert.deepEqual(fields("дом 55/6 кв 12а"), { house: "55/6", apartment: "12а" });
  });

  test("привязанные пары вырезаются из текста вместе с точкой и №", () => {
    const { text } = bindLabeledNumbers("Абая кв. #191 подъезд 2");
    assert.equal(text.replace(/\s+/gu, " ").trim(), "Абая");
  });
});

describe("parseAddress: склеенные адреса без LLM", () => {
  test("город + всё слитно: Астана12дом4подъезд191кв.", () => {
    assert.deepEqual(
      parse("Астана12дом4подъезд191кв."),
      full({ ...ASTANA, house: "12", entrance: "4", apartment: "191" })
    );
  });

  test("слитный квартал: 66квартал 12дом 69квартира", () => {
    assert.deepEqual(
      parse("66квартал 12дом 69квартира"),
      full({ street_type: "квартал", street_name: "66", house: "12", apartment: "69" })
    );
  });

  test("пример из ТЗ: Туран 55/6 магазин береке 4подьезд 9этаж", () => {
    assert.deepEqual(
      parse("Туран 55/6 магазин береке 4подьезд 9этаж"),
      full({ street_name: "Туран", house: "55/6", entrance: "4", floor: "9", landmark: "магазин береке" })
    );
  });

  test("номер микрорайона не путается с домом: Нурсити 2 микрорайон 11дом 5 подьезд 239 кв", () => {
    assert.deepEqual(
      parse("Нурсити 2 микрорайон 11дом 5 подьезд 239 кв"),
      full({ street_type: "микрорайон", street_name: "Нурсити 2", house: "11", entrance: "5", apartment: "239" })
    );
  });

  test("улица слитно с номером и деталями: Сыганак25дом7подъезд3этаж45кв", () => {
    assert.deepEqual(
      parse("Астана Сыганак25дом7подъезд3этаж45кв"),
      full({ ...ASTANA, street_name: "Сыганак", house: "25", entrance: "7", floor: "3", apartment: "45" })
    );
  });

  test("метка перед числом, слитно: дом12подъезд4этаж3кв191", () => {
    assert.deepEqual(
      parse("Астана Абая дом12подъезд4этаж3кв191"),
      full({ ...ASTANA, street_name: "Абая", house: "12", entrance: "4", floor: "3", apartment: "191" })
    );
  });

  test("дробь не теряется: Абая 1/2кв7", () => {
    assert.deepEqual(
      parse("Алматы Абая 1/2кв7"),
      full({ ...ALMATY, street_name: "Абая", house: "1/2", apartment: "7" })
    );
  });

  test("литера дома не принимается за ключевое слово: Тауелсиздик12а кв5", () => {
    assert.deepEqual(
      parse("Астана Тауелсиздик12а кв5"),
      full({ ...ASTANA, street_name: "Тауелсиздик", house: "12а", apartment: "5" })
    );
  });

  test("латиница: flat191 Абая5", () => {
    assert.deepEqual(
      parse("Алматы flat191 Абая5"),
      full({ ...ALMATY, street_name: "Абая", house: "5", apartment: "191" })
    );
  });

  test("сокращение с пробелом перед точкой: Ул .Курильская9кв1", () => {
    assert.deepEqual(
      parse("Ул .Курильская9кв1"),
      full({ street_type: "улица", street_name: "Курильская", house: "9", apartment: "1" })
    );
  });

  test("двуязычная склейка + микрорайон: 11мкр 5дом 12кв", () => {
    assert.deepEqual(
      parse("город Актобе/Ақтөбе қаласы, 11мкр 5дом 12кв"),
      full({ province: "Актюбинская область", city: "Актобе", street_type: "микрорайон", street_name: "11", house: "5", apartment: "12" })
    );
  });

  test("пример из ТЗ с запятыми: Мкр Аксай 3а, 59, кв 70", () => {
    assert.deepEqual(
      parse("город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70"),
      full({ ...ALMATY, street_type: "микрорайон", street_name: "Аксай 3а", house: "59", apartment: "70" })
    );
  });

  test("знак № не превращается в «No»: Flat №191", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 5, Flat №191"),
      full({ ...ALMATY, street_type: "улица", street_name: "Абая", house: "5", apartment: "191" })
    );
  });

  test("raw_address возвращается без изменений", () => {
    const raw = "Астана12дом4подъезд191кв.";
    assert.equal(parseAddress({ id: "r1", raw_address: raw }).raw_address, raw);
  });

  test("нормализованный текст виден в details только если он менялся", () => {
    assert.equal(parseAddress("Астана12дом4подъезд191кв.").details.normalized_text, "Астана 12 дом 4 подъезд 191 кв.");
    assert.equal(parseAddress("Алматы, ул. Абая 5").details.normalized_text, undefined);
  });

  test("слитная и раздельная записи дают один и тот же разбор", () => {
    const pairs = [
      ["Астана12дом4подъезд191кв.", "Астана 12 дом 4 подъезд 191 кв."],
      ["Алматы Абая дом12подъезд4кв191", "Алматы Абая дом 12 подъезд 4 кв 191"],
      ["Алматы Абая 5дом191кв2подъезд4этаж", "Алматы Абая 5 дом 191 кв 2 подъезд 4 этаж"]
    ];
    for (const [glued, spaced] of pairs) assert.deepEqual(parse(glued), parse(spaced), glued);
  });
});

describe("производительность", () => {
  test("1000 склеенных записей разбираются быстрее 5 секунд (лимит ТЗ: 5 минут)", () => {
    const sample = [
      "Астана12дом4подъезд191кв.", "66квартал 12дом 69квартира", "Ул .Курильская9кв1",
      "Нурсити 2 микрорайон 11дом 5 подьезд 239 кв", "Туран 55/6 магазин береке 4подьезд 9этаж"
    ];
    const started = performance.now();
    for (let i = 0; i < 1000; i++) parseAddress(sample[i % sample.length]);
    assert.ok(performance.now() - started < 5000);
  });
});
