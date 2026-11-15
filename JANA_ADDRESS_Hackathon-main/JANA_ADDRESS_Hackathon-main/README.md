# Jana Address

A local Kazakhstan address checker with batch processing and an offline Jana Post map.

## Run on Windows

1. Install Node.js 20 or later.
2. Open PowerShell in the project folder.
3. Run `node server.mjs`.
4. Open <http://localhost:8080>.

To use another port, run `$env:PORT = '8787'` before `node server.mjs`.

The offline map needs the local server and `data/kazakhstan.pmtiles`. Opening the HTML files directly with `file://` will not work.

## Docker

Run `docker compose up --build`, then open <http://localhost:8080>. The compose file starts the app and Ollama. Ollama may need to download the configured model on first use.

## Project files

- `web/` — site pages and map UI.
- `app/` — server and address parser.
- `data/kazakhstan.pmtiles` — offline Kazakhstan map archive.
- `data/reference.json` — local address reference.
- `fonts/` and `vendor/` — local map resources.
- `test/` — project tests (`npm test`).

Jana Post points in `web/assets/branches.js` are demonstration data, not an official directory.

Map data is based on OpenStreetMap. Preserve © OpenStreetMap contributors attribution. The data is distributed under the Open Database License.

## Слитное написание адресов (без LLM)

Парсер работает на правилах и не требует Ollama. Перед разбором текст проходит два шага:

1. `app/normalize.mjs` — ставит пробелы на стыках токенов: «слово+число» (`Назарбаева8`), «число+ключевое слово» (`12дом`, `4подьезд`, `191кв.`), «ключевое слово+число» (`кв191`, `flat191`), «сокращение+точка» (`Ул .Курильская`, `г.Алматы`), запятая без пробела.
   `Астана12дом4подъезд191кв.` → `Астана 12 дом 4 подъезд 191 кв.`
2. `app/labels.mjs` — привязывает числа к меткам дом/кв/подъезд/этаж. Для цепочки вроде `дом 12 подъезд 4 этаж 3 кв 191` у «подъезд» есть число и слева, и справа; перебираются варианты и выбирается тот, где все метки получили число, а лишних чисел меньше. Поддерживаются оба стиля (`кв 191` и `191 кв`) и их смесь.

Что намеренно **не** режется: литера и дробь дома (`12а`, `55/6`), одиночное «д» (`12д` — литера), слова, лишь начинающиеся как ключевые (`5квази`). Нормализованная строка доступна в `details.normalized_text`, `raw_address` не меняется.

Известные ограничения: цифры без разделителей (`3а59кв70`) и ключевое слово, приклеенное к концу слова (`Абаякв34`), правилами не разделить; названия вида `Самал2` разделяются как `Самал 2`.

Тесты: `npm test` (`test/glued-text.test.mjs` — слитное написание).
