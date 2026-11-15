const fields = [
  ["province", "Область"], ["city", "Город"], ["district", "Район"],
  ["living_area", "Жилмассив"], ["street_type", "Тип улицы"], ["street_name", "Улица"],
  ["house", "Дом"], ["apartment", "Квартира"], ["entrance", "Подъезд"],
  ["floor", "Этаж"], ["landmark", "Ориентир"]
];
const LOW_CONFIDENCE = 0.7;
const state = { records: [], view: "addresses", initializedMap: false };
const $ = selector => document.querySelector(selector);
const body = $("#results-body");
const notice = $("#notice");

function showNotice(message, error = false, warning = false) {
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle("error", error);
  notice.classList.toggle("warning", warning);
}

function getRecordList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.records)) return data.records;
  throw new Error("Файл должен содержать массив записей или объект с полем records.");
}

async function parseRecords(records) {
  if (records.length === 0) throw new Error("В файле нет адресов для обработки.");
  if (records.some(record => !record || typeof record !== "object" || typeof record.raw_address !== "string")) {
    throw new Error("У каждой записи должно быть текстовое поле raw_address.");
  }
  const response = await fetch("/api/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Ошибка API (${response.status}).`);
  state.records = payload.records;
  render();
  $("#download").disabled = false;
  const ai = payload.ai;
  if (ai?.status === "used" || ai?.status === "partial") {
    const remaining = ai.skipped ? ` Ещё ${ai.skipped} адресов оставлены обычному парсеру из-за лимита AI-проверок.` : "";
    showNotice(`Обработано адресов: ${payload.count}. Локальная модель помогла уточнить: ${ai.enhanced}; проверьте низкую уверенность перед экспортом.${remaining}`, false, Boolean(ai.skipped));
  } else {
    showNotice(`Обработано адресов: ${payload.count}. Все строки сохранены в результате.`);
  }
}

function filteredRecords() {
  const query = $("#filter").value.trim().toLocaleLowerCase("ru");
  const reviewOnly = $("#review-only").checked;
  return state.records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => !reviewOnly || record.confidence < LOW_CONFIDENCE)
    .filter(({ record }) => !query || `${record.raw_address} ${record.current_address?.display ?? ""} ${record.id ?? ""}`.toLocaleLowerCase("ru").includes(query));
}

function createEditableCell(record, index, key, label) {
  const cell = document.createElement("td");
  const input = document.createElement("input");
  input.className = "editable";
  input.type = "text";
  input.value = record[key] ?? "";
  input.placeholder = "—";
  input.setAttribute("aria-label", `${label}: ${record.raw_address}`);
  input.addEventListener("change", () => {
    const record = state.records[index];
    record[key] = input.value.trim() || null;
    if (record.current_address) {
      if (["city", "street_type", "street_name"].includes(key)) {
        delete record.current_address;
        cell.closest("tr").querySelector(".current-address")?.remove();
      } else {
        record.current_address.house = record.house;
        record.current_address.apartment = record.apartment;
        record.current_address.entrance = record.entrance;
        record.current_address.floor = record.floor;
        const current = record.current_address;
        current.display = [
          current.city,
          [current.street_type, current.street_name].filter(Boolean).join(" "),
          current.house ? `дом ${current.house}` : null,
          current.apartment ? `кв. ${current.apartment}` : null,
          current.entrance ? `подъезд ${current.entrance}` : null,
          current.floor ? `этаж ${current.floor}` : null
        ].filter(Boolean).join(", ");
        const currentAddress = cell.closest("tr").querySelector(".current-address");
        if (currentAddress) currentAddress.textContent = `Современный адрес по справочнику: ${current.display}`;
      }
    }
  });
  cell.append(input);
  return cell;
}

function render() {
  const visible = filteredRecords();
  body.replaceChildren();
  if (!visible.length) {
    const row = document.createElement("tr");
    row.className = "empty-row";
    const cell = document.createElement("td");
    cell.colSpan = 13;
    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.textContent = state.records.length ? "⌕" : "⌑";
    const title = document.createElement("strong");
    title.textContent = state.records.length ? "Ничего не найдено" : "Здесь появятся разобранные адреса";
    const details = document.createElement("span");
    details.textContent = state.records.length ? "Измените поиск или отключите фильтр уверенности." : "Загрузите JSON-файл или введите адрес выше.";
    cell.append(icon, title, details);
    row.append(cell);
    body.append(row);
  } else {
    const fragment = document.createDocumentFragment();
    for (const { record, index } of visible) {
      const row = document.createElement("tr");
      const original = document.createElement("td");
      const raw = document.createElement("span");
      raw.className = "raw-address";
      raw.title = record.raw_address;
      raw.textContent = record.raw_address;
      const id = document.createElement("span");
      id.className = "record-id";
      id.textContent = record.id == null ? `Запись ${index + 1}` : String(record.id);
      original.append(raw, id);
      if (record.current_address) {
        const currentAddress = document.createElement("span");
        currentAddress.className = "current-address";
        currentAddress.textContent = `Современный адрес по справочнику: ${record.current_address.display}`;
        original.append(currentAddress);
      }
      row.append(original);
      for (const [key, label] of fields) row.append(createEditableCell(record, index, key, label));
      const confidenceCell = document.createElement("td");
      const confidence = document.createElement("span");
      confidence.className = `confidence${record.confidence < LOW_CONFIDENCE ? " low" : ""}`;
      const dot = document.createElement("i");
      confidence.append(dot, document.createTextNode(`${Math.round(record.confidence * 100)}%`));
      confidenceCell.append(confidence);
      row.append(confidenceCell);
      fragment.append(row);
    }
    body.append(fragment);
  }
  $("#results-count").textContent = state.records.length
    ? `Показано ${visible.length} из ${state.records.length} записей`
    : "Нет записей";
  $("#metric-total").textContent = String(state.records.length);
  $("#metric-confident").textContent = String(state.records.filter(record => record.confidence >= LOW_CONFIDENCE).length);
  $("#metric-review").textContent = String(state.records.filter(record => record.confidence < LOW_CONFIDENCE).length);
}

async function readFile(file) {
  try {
    if (!file || !file.name.toLocaleLowerCase("ru").endsWith(".json")) {
      throw new Error("Выберите файл в формате JSON.");
    }
    await parseRecords(getRecordList(JSON.parse(await file.text())));
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    $("#file-input").value = "";
  }
}

function downloadResults() {
  const output = state.records.map(record => ({
    id: record.id,
    raw_address: record.raw_address,
    ...Object.fromEntries(fields.map(([field]) => [field, record[field] ?? null])),
    confidence: record.confidence,
    ...(record.current_address ? { current_address: record.current_address } : {})
  }));
  const blob = new Blob([`${JSON.stringify(output, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "jana-address-output.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function setView(view) {
  state.view = view;
  const isMap = view === "map";
  $("#addresses-view").hidden = isMap;
  $("#map-view").hidden = !isMap;
  $("#breadcrumb").textContent = isMap ? "Карта Казахстана" : "Разбор адресов";
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  if (isMap) {
    if (!state.initializedMap) {
      $("#map-frame").src = "/offline-map.html";
      state.initializedMap = true;
    }
    $("#open-map").onclick = () => window.open("/offline-map.html", "_blank", "noopener");
  }
}

$("#choose-file").addEventListener("click", () => $("#file-input").click());
$("#drop-zone").addEventListener("click", event => {
  if (event.target.closest("button")) return;
  $("#file-input").click();
});
$("#file-input").addEventListener("change", event => readFile(event.target.files[0]));
$("#drop-zone").addEventListener("dragover", event => {
  event.preventDefault();
  $("#drop-zone").classList.add("dragging");
});
$("#drop-zone").addEventListener("dragleave", () => $("#drop-zone").classList.remove("dragging"));
$("#drop-zone").addEventListener("drop", event => {
  event.preventDefault();
  $("#drop-zone").classList.remove("dragging");
  readFile(event.dataTransfer.files[0]);
});
$("#parse-one").addEventListener("click", async () => {
  const raw_address = $("#single-address").value;
  if (!raw_address.trim()) {
    showNotice("Введите адрес для разбора.", true);
    return;
  }
  try {
    await parseRecords([{ id: `manual_${Date.now()}`, raw_address }]);
  } catch (error) {
    showNotice(error.message, true);
  }
});
$("#single-address").addEventListener("keydown", event => {
  if (event.key === "Enter") $("#parse-one").click();
});
$("#sample").addEventListener("click", async () => {
  const samples = [
    { id: "demo_001", raw_address: "город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70" },
    { id: "demo_002", raw_address: "Ул .Курильская 9 кв 1" },
    { id: "demo_003", raw_address: "Туран 55/6 магазин береке 4подьезд 9этаж" },
    { id: "demo_004", raw_address: "Нурсити 2 микрорайон 11дом 5 подьезд 239 кв" },
    { id: "demo_005", raw_address: "Турксибский район, Рыбинский переулок, дом 4" },
    { id: "demo_006", raw_address: "66квартал 12дом 69квартира" },
    { id: "demo_007", raw_address: "город Актобе/Ақтөбе қаласы, Назарбаева8, flat 191" }
  ];
  try {
    await parseRecords(samples);
  } catch (error) {
    showNotice(error.message, true);
  }
});
$("#download").addEventListener("click", downloadResults);
$("#filter").addEventListener("input", render);
$("#review-only").addEventListener("change", render);
document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

fetch("/api/health")
  .then(response => {
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    return response.json();
  })
  .then(health => {
    $("#api-label").textContent = "API работает";
    $("#metric-catalog").textContent = `${health.catalog.cities} городов`;
    const ollama = health.ollama;
    const ollamaLabel = $("#ollama-label");
    const ready = Boolean(ollama?.available && ollama?.model_available);
    ollamaLabel.hidden = !ready; // при недоступной модели плашку не показываем: парсер работает по правилам
    ollamaLabel.classList.toggle("ready", ready);
    if (ready) ollamaLabel.textContent = `Локальная модель · ${ollama.model}`;
  })
  .catch(() => {
    $("#api-label").textContent = "API недоступен";
    $(".api-status").classList.add("offline");
    $("#metric-catalog").textContent = "—";
    $("#ollama-label").hidden = true;
  });
