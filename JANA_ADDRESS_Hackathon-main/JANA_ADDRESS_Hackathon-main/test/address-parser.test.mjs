// Юнит-тесты парсера адресов (app/parser.mjs): краевые случаи разбора.
// Запуск: npm test  (или node --test test/address-parser.test.mjs)
//
// Тесты с { todo: "..." } описывают ожидаемое поведение, которое парсер сейчас не обеспечивает.
// Раннер показывает их как TODO и не считает провалом; когда парсер будет исправлен и тест
// начнёт проходить, достаточно удалить опцию todo.

import assert from "node:assert/strict";
import test, { describe } from "node:test";

// Тесты не должны создавать файл базы справочника в data/.
process.env.CATALOG_DB ??= ":memory:";
const { parseAddress, parseBatch } = await import("../app/parser.mjs");

const FIELDS = [
  "province", "city", "district", "living_area", "street_type", "street_name",
  "house", "apartment", "entrance", "floor", "landmark"
];
const EMPTY = Object.freeze(Object.fromEntries(FIELDS.map(field => [field, null])));

/** Все 11 полей записи; всё, что не названо в `expected`, должно быть null. */
const full = expected => ({ ...EMPTY, ...expected });
const fieldsOf = result => Object.fromEntries(FIELDS.map(field => [field, result[field]]));
const parse = raw => fieldsOf(parseAddress(raw));
/** Только перечисленные поля — для случаев, где важна часть разбора, а не вся запись. */
const pick = (raw, names) => {
  const result = parseAddress(raw);
  return Object.fromEntries(names.map(name => [name, result[name]]));
};

const ALMATY = { province: "Алматы", city: "Алматы" };
const ASTANA = { province: "Астана", city: "Астана" };
const ABAY = { street_type: "улица", street_name: "Абая" };

describe("1. Дробные и литерные номера, квартиры", () => {
  test("дробь через слэш: 1/2", () => {
    assert.deepEqual(parse("Алматы, ул. Абая 1/2"), full({ ...ALMATY, ...ABAY, house: "1/2" }));
  });

  test("дробь и квартира с точкой: 55/6, кв. 191", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 55/6, кв. 191"),
      full({ ...ALMATY, ...ABAY, house: "55/6", apartment: "191" })
    );
  });

  test("дробь с обратным слэшем сохраняется как есть", () => {
    assert.equal(parseAddress("Алматы, ул. Абая 55\\6").house, "55\\6");
  });

  test("литера в номере дома: 12а (проспект)", () => {
    assert.deepEqual(
      parse("Астана, пр. Тауелсиздик 12а"),
      full({ ...ASTANA, street_type: "проспект", street_name: "Тауелсиздик", house: "12а" })
    );
  });

  test("регистр литеры сохраняется: 5Б", () => {
    assert.equal(parseAddress("Алматы, ул. Абая 5Б").house, "5Б");
  });

  test("литера и квартира: 12а кв 5", () => {
    assert.deepEqual(
      parse("Астана, пр. Тауелсиздик 12а кв 5"),
      full({ ...ASTANA, street_type: "проспект", street_name: "Тауелсиздик", house: "12а", apartment: "5" })
    );
  });

  test("квартира с точкой без пробела: кв.191", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 5, кв.191"),
      full({ ...ALMATY, ...ABAY, house: "5", apartment: "191" })
    );
  });

  test("д. и кв. с точками, без пробелов после них", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая, д.5, кв.191"),
      full({ ...ALMATY, ...ABAY, house: "5", apartment: "191" })
    );
  });

  test("метки д. и кв. без запятых между ними", () => {
    assert.deepEqual(
      parse("Алматы ул Абая д 5 кв 191"),
      full({ ...ALMATY, ...ABAY, house: "5", apartment: "191" })
    );
  });

  test("дробь с подъездом и этажом: 1/2, кв. 191, 3 подъезд, 5 этаж", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 1/2, кв. 191, 3 подъезд, 5 этаж"),
      full({ ...ALMATY, ...ABAY, house: "1/2", apartment: "191", entrance: "3", floor: "5" })
    );
  });

  test("номер квартиры не подменяет номер дома", () => {
    const result = parseAddress("Алматы, ул. Абая 5/1 кв. 191");
    assert.equal(result.house, "5/1");
    assert.equal(result.apartment, "191");
  });

  test("уверенность выше порога Ollama, когда дом и квартира найдены", () => {
    assert.equal(parseAddress("Алматы, ул. Абая 55/6, кв. 191").confidence >= 0.9, true);
  });
});

describe("2. Слитное написание", () => {
  test("66квартал и 12дом", () => {
    assert.deepEqual(
      parse("Караганда, 66квартал, 12дом"),
      full({ province: "Карагандинская область", city: "Караганда", street_type: "квартал", street_name: "66", house: "12" })
    );
  });

  test("слитно и без запятых: 66квартал 12дом 5кв", () => {
    assert.deepEqual(
      parse("Алматы, 66квартал 12дом 5кв"),
      full({ ...ALMATY, street_type: "квартал", street_name: "66", house: "12", apartment: "5" })
    );
  });

  test("слитное написание равно раздельному", () => {
    assert.deepEqual(parse("Караганда, 66квартал, 12дом"), parse("Караганда, 66 квартал, дом 12"));
  });

  test("12дом и 4подьезд (ь вместо ъ)", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая, 12дом, 4подьезд"),
      full({ ...ALMATY, ...ABAY, house: "12", entrance: "4" })
    );
  });

  test("4подьезд, 3этаж, кв 7", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 5, 4подьезд, 3этаж, кв 7"),
      full({ ...ALMATY, ...ABAY, house: "5", apartment: "7", entrance: "4", floor: "3" })
    );
  });

  test("все детали слитно: 12дом 4подьезд 3этаж 191кв", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая, 12дом 4подьезд 3этаж 191кв"),
      full({ ...ALMATY, ...ABAY, house: "12", apartment: "191", entrance: "4", floor: "3" })
    );
  });

  test("квартира числом перед меткой: 191кв и 191 кв", () => {
    const expected = full({ ...ALMATY, ...ABAY, house: "5", apartment: "191" });
    assert.deepEqual(parse("Алматы, ул. Абая 5 191кв"), expected);
    assert.deepEqual(parse("Алматы, ул. Абая 5, 191 кв"), expected);
  });

  test("подъезд сразу после номера дома без запятой: Абая 5 4подъезд", () => {
    assert.deepEqual(
      parse("Алматы, Абая 5 4подъезд"),
      full({ ...ALMATY, street_name: "Абая", house: "5", entrance: "4" })
    );
  });

  test("то же с цифрами перед метками, через пробелы: 4 подъезд, 3 этаж, 7 кв", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 5, 4 подъезд, 3 этаж, 7 кв"),
      full({ ...ALMATY, ...ABAY, house: "5", apartment: "7", entrance: "4", floor: "3" })
    );
  });

  test("метка перед числом: дом 5 кв 191 подъезд 2 этаж 4", () => {
    assert.deepEqual(
      parse("Алматы ул Абая дом 5 кв 191 подъезд 2 этаж 4"),
      full({ ...ALMATY, ...ABAY, house: "5", apartment: "191", entrance: "2", floor: "4" })
    );
  });
});

describe("3. Латиница и английские сокращения", () => {
  const expected = full({ ...ALMATY, ...ABAY, house: "5", apartment: "191" });

  test("flat 191", () => {
    assert.deepEqual(parse("Алматы, ул. Абая 5, flat 191"), expected);
  });

  test("kv 12, KV 12", () => {
    const twelve = full({ ...ALMATY, ...ABAY, house: "5", apartment: "12" });
    assert.deepEqual(parse("Алматы, ул. Абая 5, kv 12"), twelve);
    assert.deepEqual(parse("Алматы, ул. Абая 5, KV 12"), twelve);
  });

  test("apt 12 и apartment 12", () => {
    const twelve = full({ ...ALMATY, ...ABAY, house: "5", apartment: "12" });
    assert.deepEqual(parse("Алматы, ул. Абая 5, apt 12"), twelve);
    assert.deepEqual(parse("Алматы, ул. Абая 5, apartment 12"), twelve);
  });

  test("метка после числа: 12 flat", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 5, 12 flat"),
      full({ ...ALMATY, ...ABAY, house: "5", apartment: "12" })
    );
  });

  test("entrance и floor", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 5, entrance 2, floor 4"),
      full({ ...ALMATY, ...ABAY, house: "5", entrance: "2", floor: "4" })
    );
  });

  test("дробный дом и flat", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 55/6, flat 191"),
      full({ ...ALMATY, ...ABAY, house: "55/6", apartment: "191" })
    );
  });

  test("kv.12 с точкой", () => {
    assert.deepEqual(
      pick("Алматы, ул. Абая 5, kv.12", ["street_name", "house", "apartment"]),
      { street_name: "Абая", house: "5", apartment: "12" }
    );
  });

  test("apt. 12 с точкой", () => {
    assert.equal(parseAddress("Алматы, ул. Абая 5, apt. 12").apartment, "12");
  });

  test("Flat №191 со знаком номера", () => {
    assert.equal(parseAddress("Алматы, ул. Абая 55/6, Flat №191").apartment, "191");
  });

  test("город латиницей: Almaty, Abay st 5, flat 191", { todo: "латинские названия городов и типы улиц (st) не распознаются" }, () => {
    assert.equal(parseAddress("Almaty, Abay st 5, flat 191").city, "Алматы");
  });
});

describe("4. Двуязычные склейки через слэш", () => {
  test("город Алматы/Алматы қаласы, улица", () => {
    assert.deepEqual(
      parse("город Алматы/Алматы қаласы, ул. Абая 5"),
      full({ ...ALMATY, ...ABAY, house: "5" })
    );
  });

  test("только город: нет мусора в других полях", () => {
    assert.deepEqual(parse("город Алматы/Алматы қаласы"), full(ALMATY));
  });

  test("без слов «город»/«қаласы»: Алматы/Алматы қаласы, Абая 5", () => {
    assert.deepEqual(
      parse("Алматы/Алматы қаласы, Абая 5"),
      full({ ...ALMATY, street_name: "Абая", house: "5" })
    );
  });

  test("город Астана/Астана қаласы, проспект", () => {
    assert.deepEqual(
      parse("город Астана/Астана қаласы, пр. Тауелсиздик 12а"),
      full({ ...ASTANA, street_type: "проспект", street_name: "Тауелсиздик", house: "12а" })
    );
  });

  test("порядок «қаласы/город»: область определяется по городу", () => {
    assert.deepEqual(
      parse("Қостанай қаласы/город Костанай, ул. Победы 10"),
      full({ province: "Костанайская область", city: "Костанай", street_type: "улица", street_name: "Победы", house: "10" })
    );
  });

  test("область и город, оба на двух языках", () => {
    assert.deepEqual(
      parse("Костанайская область/Қостанай облысы, город Костанай/Қостанай қаласы, ул. Победы 10"),
      full({ province: "Костанайская область", city: "Костанай", street_type: "улица", street_name: "Победы", house: "10" })
    );
  });

  test("казахское написание улицы: Абай көшесі 5", { todo: "название улицы обрезается до «Абай сі»" }, () => {
    assert.deepEqual(
      pick("Алматы қаласы, Абай көшесі 5", ["street_type", "street_name", "house"]),
      { street_type: "улица", street_name: "Абай", house: "5" }
    );
  });

  test("сокращение қ. после слэша: г. Алматы/Алматы қ.", { todo: "«қ» попадает в living_area" }, () => {
    assert.equal(parseAddress("г. Алматы/Алматы қ., ул. Абая 5").living_area, null);
  });
});

describe("5. Ориентиры и шум в строке", () => {
  test("магазин Береке — ориентир, регистр сохраняется", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 5, магазин Береке"),
      full({ ...ALMATY, ...ABAY, house: "5", landmark: "магазин Береке" })
    );
  });

  test("ориентир перед квартирой не мешает квартире", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 5, магазин береке, кв 7"),
      full({ ...ALMATY, ...ABAY, house: "5", apartment: "7", landmark: "магазин береке" })
    );
  });

  test("ориентир после квартиры", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 5, кв. 191, магазин Береке"),
      full({ ...ALMATY, ...ABAY, house: "5", apartment: "191", landmark: "магазин Береке" })
    );
  });

  test("ориентир без запятой после дома: кафе Дастархан", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 5 кафе Дастархан"),
      full({ ...ALMATY, ...ABAY, house: "5", landmark: "кафе Дастархан" })
    );
  });

  test("ТЦ и Kazpost распознаются как ориентиры", () => {
    assert.equal(parseAddress("Алматы, ул. Абая 5, ТЦ Мега").landmark, "ТЦ Мега");
    assert.equal(parseAddress("Алматы, ул. Абая 5, Kazpost").landmark, "Kazpost");
  });

  test("номер дома находится рядом с шумовыми словами", () => {
    for (const noise of ["возле остановки", "около магазина Береке", "рядом с аптекой", "позвоните за час"]) {
      assert.equal(parseAddress(`Алматы, ул. Абая 5, ${noise}`).house, "5", noise);
    }
  });

  // Маркеры локации и шум уходят в ориентир (landmark и details.landmark), а улица остаётся чистой.
  const landmarkOf = raw => {
    const result = parseAddress(raw);
    assert.equal(result.details.landmark, result.landmark, "details.landmark зеркалит landmark");
    return pick(raw, ["street_type", "street_name", "house", "landmark"]);
  };
  const withLandmark = landmark => ({ ...ABAY, house: "5", landmark });

  for (const [phrase, landmark] of [
    ["возле остановки", "возле остановки"],
    ["около магазина Береке", "около магазина Береке"],
    ["рядом с аптекой", "рядом с аптекой"],
    ["напротив ТЦ Мега", "напротив ТЦ Мега"],
    ["недалеко от школы", "недалеко от школы"],
    ["near the bus stop", "near the bus stop"],
    ["аялдама жанында", "аялдама жанында"],
    ["позвоните за час", "позвоните за час"]
  ]) {
    test(`«${phrase}» в конце: улица чистая, фраза в landmark`, () => {
      assert.deepEqual(landmarkOf(`Алматы, ул. Абая 5, ${phrase}`), withLandmark(landmark));
    });
  }

  test("фраза сразу после дома, без запятой", () => {
    assert.deepEqual(landmarkOf("Алматы, ул. Абая 5 возле остановки"), withLandmark("возле остановки"));
  });

  test("фраза перед номером дома не забирает номер: около школы 5", () => {
    assert.deepEqual(landmarkOf("Алматы, ул. Абая около школы 5"), withLandmark("около школы"));
  });

  test("маркер локации и ключевое слово: оба ориентира сохраняются в порядке строки", () => {
    assert.deepEqual(
      landmarkOf("Алматы, ул. Абая 5 возле остановки, магазин береке"),
      withLandmark("возле остановки, магазин береке")
    );
    assert.deepEqual(
      landmarkOf("Алматы, ул. Абая 5, магазин береке возле остановки"),
      withLandmark("магазин береке, возле остановки")
    );
  });

  test("ориентир не мешает квартире и подъезду", () => {
    assert.deepEqual(
      parse("Алматы, ул. Абая 5, около магазина Береке, 3 подъезд, кв 7"),
      full({ ...ALMATY, ...ABAY, house: "5", apartment: "7", entrance: "3", landmark: "около магазина Береке" })
    );
  });

  test("остановка без маркера тоже ориентир", () => {
    assert.deepEqual(landmarkOf("Алматы, ул. Абая, 5, остановка"), withLandmark("остановка"));
  });

  test("ориентир в скобках: скобки не остаются в улице", () => {
    assert.deepEqual(
      pick("Алматы, ул. Абая 5 кв. 191 (магазин Береке)", ["street_name", "apartment", "landmark"]),
      { street_name: "Абая", apartment: "191", landmark: "магазин Береке" }
    );
    assert.equal(parseAddress("Алматы, ул. Абая 5 (возле остановки)").street_name, "Абая");
  });

  test("без ориентира details.landmark равен null", () => {
    const result = parseAddress("Алматы, ул. Абая 5");
    assert.equal(result.landmark, null);
    assert.deepEqual(result.details, { landmark: null });
  });
});

describe("Общие свойства", () => {
  test("raw_address возвращается без изменений", () => {
    const raw = "  город Алматы/Алматы қаласы,  ул. Абая 55/6, кв. 191 ";
    assert.equal(parseAddress(raw).raw_address, raw);
  });

  test("id передаётся из записи", () => {
    const result = parseAddress({ id: 7, raw_address: "Астана, Абая 5" });
    assert.equal(result.id, 7);
    assert.equal(result.city, "Астана");
  });

  test("пустая строка и пробелы дают пустую запись с минимальной уверенностью", () => {
    for (const raw of ["", "   "]) {
      const result = parseAddress(raw);
      assert.deepEqual(fieldsOf(result), full({}));
      assert.equal(result.confidence < 0.1, true);
    }
  });

  test("parseBatch эквивалентен parseAddress для каждой записи", () => {
    const records = ["Алматы, ул. Абая 1/2", "Астана, пр. Тауелсиздик 12а", "Алматы, ул. Абая 5, kv 12"];
    assert.deepEqual(parseBatch(records), records.map(parseAddress));
  });

  test("parseBatch не принимает не-массив", () => {
    assert.throws(() => parseBatch("Алматы"), TypeError);
  });

  test("разбор детерминирован", () => {
    const raw = "город Алматы/Алматы қаласы, ул. Абая 55/6, 4подьезд, flat 191, магазин Береке";
    assert.deepEqual(parseAddress(raw), parseAddress(raw));
  });

  test("комбинация всех приёмов в одной строке", () => {
    assert.deepEqual(
      parse("город Алматы/Алматы қаласы, ул. Абая 55/6, 4подьезд, 3этаж, flat 191, магазин Береке"),
      full({ ...ALMATY, ...ABAY, house: "55/6", apartment: "191", entrance: "4", floor: "3", landmark: "магазин Береке" })
    );
  });
});
