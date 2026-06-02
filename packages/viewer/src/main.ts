import type {
  BenchResults,
  BenchStartRequest,
  BenchStatus,
  MetaResponse,
  ModelOption,
  ModelsResponse,
  ProblemMeta,
  RunListEntry,
} from "./types.js";
import { renderResults } from "./render.js";
import { problemsForRun, renderProblemsReference } from "./render-problems.js";
import { scrollActivityFeedToBottom, shouldAutoScrollFeed } from "./render-live.js";

const LIVE_FILE = "live.json";
const POLL_MS = 1000;

const app = document.getElementById("app")!;
let meta: MetaResponse | null = null;
let modelOptions: ModelOption[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;
let watchingLive = false;

function shell() {
  app.innerHTML = `
    <div class="layout">
      <header>
        <h1>World-Hop Benchmark</h1>
        <p>Configure and run benchmarks, watch results update live</p>
      </header>

      <section class="run-panel">
        <h2>New run</h2>
        <form id="run-form" class="run-form">
          <div class="form-grid">
            <label>Model<select id="model-select" name="model" required></select></label>
            <label>Max slot (ms)<input id="slot-input" name="slotMs" type="number" min="1000" step="1000" required /></label>
            <label id="duration-label">Max bench time (sec)<input id="duration-input" name="durationSec" type="number" min="10" step="5" required /></label>
            <label>Seed<input id="seed-input" name="benchSeed" type="number" required /></label>
            <label>Task pack<select id="pack-select" name="taskPack"></select></label>
            <label>Worlds<input id="worlds-input" name="worldCount" type="number" min="1" max="8" required readonly title="Always equals the number of selected tasks" /></label>
          </div>
          <fieldset id="problems-fieldset" class="problems-fieldset">
            <legend>Tasks for this run</legend>
            <div id="problems-list" class="problems-checkboxes"></div>
            <label class="checkbox-inline"><input type="checkbox" id="all-problems" checked /> All tasks in pack</label>
          </fieldset>
          <div id="pack-tasks-reference" class="pack-tasks-reference"></div>
          <div id="duration-hint" class="duration-hint" hidden></div>
          <div class="form-actions">
            <button type="submit" id="start-btn">Start run</button>
            <button type="button" id="stop-btn" disabled>Stop</button>
            <button type="button" id="watch-live-btn">Watch live</button>
            <span id="run-status-text" class="run-status-text"></span>
          </div>
        </form>
      </section>

      <div class="toolbar">
        <label for="run-select">Past runs</label>
        <select id="run-select"><option value="">— select —</option></select>
        <button type="button" id="refresh-btn">Refresh</button>
        <label class="drop-zone" id="drop-zone">
          Drop JSON here or <input type="file" id="file-input" accept=".json" hidden /> browse
        </label>
      </div>
      <div id="content">
        <div class="empty">Start a run or select a past result</div>
      </div>
    </div>
  `;
}

async function fetchModels() {
  const res = await fetch("/api/models");
  if (!res.ok) throw new Error("Failed to load models");
  const data = (await res.json()) as ModelsResponse;
  modelOptions = data.models;
}

function resolveModelId(requested: string | undefined): string {
  if (!requested) return modelOptions[0]?.id ?? "composer-2.5";
  const exact = modelOptions.find((m) => m.id === requested);
  if (exact) return exact.id;
  const lower = requested.toLowerCase();
  const byAlias = modelOptions.find(
    (m) =>
      m.aliases?.some((a) => a.toLowerCase() === lower) ||
      m.id.toLowerCase() === lower ||
      m.displayName.toLowerCase() === lower,
  );
  if (byAlias) return byAlias.id;
  return requested;
}

function populateModelSelect(selected?: string) {
  const select = document.getElementById("model-select") as HTMLSelectElement;
  select.innerHTML = "";
  for (const model of modelOptions) {
    const opt = document.createElement("option");
    opt.value = model.id;
    opt.textContent = model.displayName;
    opt.title = model.description ? `${model.id} — ${model.description}` : model.id;
    select.appendChild(opt);
  }
  const resolved = resolveModelId(selected ?? meta?.defaults.model);
  if ([...select.options].some((o) => o.value === resolved)) {
    select.value = resolved;
  }
}

async function fetchMeta() {
  const res = await fetch("/api/meta");
  if (!res.ok) throw new Error("Failed to load config metadata");
  meta = (await res.json()) as MetaResponse;
}

async function fetchRunList(): Promise<RunListEntry[]> {
  const res = await fetch("/api/runs");
  if (!res.ok) return [];
  return (await res.json()) as RunListEntry[];
}

async function fetchRun(name: string) {
  const res = await fetch(`/api/runs/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Failed to load ${name}`);
  return (await res.json()) as BenchResults;
}

async function fetchBenchStatus() {
  const res = await fetch("/api/bench/status");
  if (!res.ok) return null;
  return (await res.json()) as BenchStatus;
}

function runProblems(data: BenchResults): ProblemMeta[] {
  if (!meta) return [];
  return problemsForRun(meta.taskPacks, data.config.taskPack ?? "example", data.config.problemIds);
}

function showResults(data: BenchResults, label: string) {
  const content = document.getElementById("content")!;
  const feed = document.getElementById("activity-feed");
  const pinFeed = feed ? shouldAutoScrollFeed(feed) : true;
  content.innerHTML = renderResults(data, data.runName ?? label, runProblems(data));
  if (watchingLive || pinFeed) {
    scrollActivityFeedToBottom(true);
  }
}

function parseFile(text: string, filename: string) {
  const data = JSON.parse(text) as BenchResults;
  if (!data.slots || !data.config) throw new Error("Invalid bench results JSON");
  stopLivePoll();
  watchingLive = false;
  showResults(data, filename);
}

function stopLivePoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startLivePoll() {
  stopLivePoll();
  watchingLive = true;
  void pollLive();
  pollTimer = setInterval(() => void pollLive(), POLL_MS);
}

async function loadLatestResult() {
  const runs = await fetchRunList();
  if (!runs.length) return;
  const latest = runs[0]!;
  const data = await fetchRun(latest.file);
  showResults(data, latest.label);
  const select = document.getElementById("run-select") as HTMLSelectElement;
  select.value = latest.file;
}

async function pollLive() {
  const benchStatus = await fetchBenchStatus();
  try {
    const data = await fetchRun(LIVE_FILE);
    showResults(data, "live.json");

    const finished =
      data.status === "complete" || data.status === "failed" || data.status === "stopped";
    const staleLive =
      !benchStatus?.running &&
      (data.status === "starting" || data.status === "running") &&
      !data.slots?.length;

    if (finished || staleLive) {
      stopLivePoll();
      watchingLive = false;
      await populateSelect(document.getElementById("run-select") as HTMLSelectElement);
      await updateRunControls();
      if (staleLive || !data.resultsFile) {
        await loadLatestResult();
      } else {
        const select = document.getElementById("run-select") as HTMLSelectElement;
        select.value = data.resultsFile;
        await loadSelectedRun(select);
      }
    }
  } catch {
    if (!benchStatus?.running) {
      stopLivePoll();
      watchingLive = false;
      await loadLatestResult();
    }
  }
}

async function loadSelectedRun(select: HTMLSelectElement) {
  if (!select.value) return;
  stopLivePoll();
  watchingLive = false;
  try {
    const data = await fetchRun(select.value);
    showResults(data, select.value);
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
}

async function populateSelect(select: HTMLSelectElement) {
  const previous = select.value;
  const runs = await fetchRunList();
  select.innerHTML = '<option value="">— select —</option>';
  for (const run of runs) {
    const opt = document.createElement("option");
    opt.value = run.file;
    opt.textContent = run.label;
    select.appendChild(opt);
  }
  if (previous && runs.some((r) => r.file === previous)) select.value = previous;
}

function renderPackReference(packId: string) {
  const el = document.getElementById("pack-tasks-reference");
  if (!el || !meta) return;
  const pack = meta.taskPacks.find((p) => p.id === packId);
  el.innerHTML = `
    <h3>Task pack: ${packId}</h3>
    <p class="pack-tasks-intro">Each world hosts one unique task per run. World count always equals the number of selected tasks.</p>
    ${renderProblemsReference(pack?.problems ?? [])}
  `;
}

function fillProblemsForPack(packId: string, selected?: string[]) {
  const container = document.getElementById("problems-list")!;
  const pack = meta?.taskPacks.find((p) => p.id === packId);
  container.innerHTML = "";
  if (!pack) return;

  const allChecked = (document.getElementById("all-problems") as HTMLInputElement).checked;

  for (const problem of pack.problems) {
    const label = document.createElement("label");
    label.className = allChecked ? "problem-option problem-option--locked" : "problem-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "problem";
    input.value = problem.id;
    input.checked = selected ? selected.includes(problem.id) : true;
    input.disabled = allChecked;

    const body = document.createElement("div");
    body.className = "problem-option-body";
    body.innerHTML = `<div class="problem-option-header"><code>${problem.id}</code> ${problem.title}</div><div class="problem-option-prompt">${problem.prompt}</div>${
      problem.artifacts?.length ?
        `<div class="problem-option-artifacts">Files: ${problem.artifacts.map((a) => `<code>${a}</code>`).join(", ")}</div>`
      : ""
    }`;

    label.appendChild(input);
    label.appendChild(body);
    container.appendChild(label);
  }

  renderPackReference(packId);
  syncWorldCountToTasks();
}

function syncWorldCountToTasks(): void {
  const worldsInput = document.getElementById("worlds-input") as HTMLInputElement | null;
  const packSelect = document.getElementById("pack-select") as HTMLSelectElement | null;
  const allProblems = document.getElementById("all-problems") as HTMLInputElement | null;
  if (!worldsInput || !packSelect || !allProblems || !meta) return;

  const pack = meta.taskPacks.find((p) => p.id === packSelect.value);
  if (!pack) return;

  const count = allProblems.checked
    ? pack.problems.length
    : [...document.querySelectorAll<HTMLInputElement>("#problems-list input:checked")].length;

  if (count > 0) {
    worldsInput.value = String(Math.min(count, 8));
  }
}

function toggleProblemCheckboxes(all: boolean) {
  for (const input of document.querySelectorAll<HTMLInputElement>("#problems-list input")) {
    input.disabled = all;
    if (all) input.checked = true;
    input.closest(".problem-option")?.classList.toggle("problem-option--locked", all);
  }
  syncWorldCountToTasks();
  updateDurationHint();
}

function countSelectedTasks(config: BenchStartRequest): number {
  if (config.problems?.length) return config.problems.length;
  const pack = meta?.taskPacks.find((p) => p.id === (config.taskPack ?? meta?.defaults.taskPack));
  return pack?.problems.length ?? 0;
}

function clearFieldErrors(): void {
  document
    .querySelectorAll("#run-form .field-error")
    .forEach((el) => el.classList.remove("field-error"));
}

function markFieldError(field: "duration" | "tasks"): void {
  if (field === "duration") {
    document.getElementById("duration-label")?.classList.add("field-error");
    document.getElementById("duration-input")?.focus();
  } else {
    document.getElementById("problems-fieldset")?.classList.add("field-error");
  }
}

function minBenchTimeMessage(minSec: number): string {
  return `Set max bench time to at least ${minSec} seconds.`;
}

function updateDurationHint(): void {
  const hint = document.getElementById("duration-hint");
  const durationInput = document.getElementById("duration-input") as HTMLInputElement | null;
  const durationLabel = document.getElementById("duration-label");
  if (!hint) return;

  const config = readFormConfig();
  const worldCount = config.worldCount ?? meta?.defaults.worldCount ?? 8;
  const slotMs = config.slotMs ?? meta?.defaults.slotMs ?? 15000;
  const durationMs = (config.durationSec ?? meta?.defaults.durationSec ?? 60) * 1000;
  const minDurationMs = worldCount * slotMs;
  const minDurationSec = Math.ceil(minDurationMs / 1000);

  if (durationInput) {
    durationInput.min = String(minDurationSec);
  }

  if (durationMs < minDurationMs) {
    durationLabel?.classList.add("field-error");
    hint.hidden = false;
    hint.classList.add("error");
    hint.textContent = minBenchTimeMessage(minDurationSec);
  } else {
    durationLabel?.classList.remove("field-error");
    hint.hidden = true;
    hint.classList.remove("error");
    hint.textContent = "";
  }
}

type RunConfigValidation = { error: string; field: "duration" | "tasks" };

function validateRunConfig(config: BenchStartRequest): RunConfigValidation | null {
  const worldCount = config.worldCount ?? meta?.defaults.worldCount ?? 8;
  const taskCount = countSelectedTasks(config);
  if (taskCount === 0) {
    return { error: "Select at least one task", field: "tasks" };
  }
  if (worldCount !== taskCount) {
    return {
      error: `World count must equal task count (${worldCount} worlds, ${taskCount} tasks selected)`,
      field: "tasks",
    };
  }

  const slotMs = config.slotMs ?? meta?.defaults.slotMs ?? 15000;
  const durationMs = (config.durationSec ?? meta?.defaults.durationSec ?? 60) * 1000;
  const minDurationMs = worldCount * slotMs;
  if (durationMs < minDurationMs) {
    const minSec = Math.ceil(minDurationMs / 1000);
    return {
      error: minBenchTimeMessage(minSec),
      field: "duration",
    };
  }

  return null;
}

function readFormConfig(): BenchStartRequest {
  const allProblems = (document.getElementById("all-problems") as HTMLInputElement).checked;
  const problems = allProblems
    ? undefined
    : [...document.querySelectorAll<HTMLInputElement>("#problems-list input:checked")].map(
        (el) => el.value,
      );

  return {
    model: (document.getElementById("model-select") as HTMLSelectElement).value,
    slotMs: Number((document.getElementById("slot-input") as HTMLInputElement).value),
    durationSec: Number((document.getElementById("duration-input") as HTMLInputElement).value),
    benchSeed: Number((document.getElementById("seed-input") as HTMLInputElement).value),
    taskPack: (document.getElementById("pack-select") as HTMLSelectElement).value,
    worldCount: Number((document.getElementById("worlds-input") as HTMLInputElement).value),
    problems,
  };
}

async function updateRunControls() {
  const status = await fetchBenchStatus();
  const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
  const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
  const statusText = document.getElementById("run-status-text")!;
  const form = document.getElementById("run-form") as HTMLFormElement;

  const running = status?.running ?? false;
  startBtn.disabled = running;
  stopBtn.disabled = !running;
  form.querySelectorAll("input, select, button[type=submit]").forEach((el) => {
    if (el.id === "stop-btn") return;
    (el as HTMLInputElement).disabled = running && el !== startBtn;
  });

  if (running) {
    statusText.textContent = "Benchmark running…";
    statusText.className = "run-status-text running";
    if (!watchingLive) startLivePoll();
  } else if (status?.error) {
    statusText.textContent = status.error;
    statusText.className = "run-status-text error";
  } else {
    statusText.textContent = "";
    statusText.className = "run-status-text";
  }
}

function populateMetaForm() {
  if (!meta) return;

  populateModelSelect(meta.defaults.model);

  const packSelect = document.getElementById("pack-select") as HTMLSelectElement;
  for (const pack of meta.taskPacks) {
    const opt = document.createElement("option");
    opt.value = pack.id;
    opt.textContent = pack.id;
    packSelect.appendChild(opt);
  }

  (document.getElementById("slot-input") as HTMLInputElement).value = String(meta.defaults.slotMs);
  (document.getElementById("duration-input") as HTMLInputElement).value = String(
    meta.defaults.durationSec,
  );
  (document.getElementById("seed-input") as HTMLInputElement).value = String(meta.defaults.benchSeed);
  packSelect.value = meta.defaults.taskPack;
  (document.getElementById("worlds-input") as HTMLInputElement).value = String(
    meta.defaults.worldCount,
  );
  fillProblemsForPack(meta.defaults.taskPack);
  updateDurationHint();
}

async function init() {
  shell();
  await Promise.all([fetchMeta(), fetchModels()]);
  populateMetaForm();

  const select = document.getElementById("run-select") as HTMLSelectElement;
  const refreshBtn = document.getElementById("refresh-btn")!;
  const dropZone = document.getElementById("drop-zone")!;
  const fileInput = document.getElementById("file-input") as HTMLInputElement;
  const runForm = document.getElementById("run-form") as HTMLFormElement;
  const packSelect = document.getElementById("pack-select") as HTMLSelectElement;
  const allProblems = document.getElementById("all-problems") as HTMLInputElement;
  const stopBtn = document.getElementById("stop-btn")!;
  const watchLiveBtn = document.getElementById("watch-live-btn")!;

  await populateSelect(select);
  await updateRunControls();
  setInterval(() => void updateRunControls(), 3000);

  packSelect.addEventListener("change", () => {
    fillProblemsForPack(packSelect.value);
  });

  allProblems.addEventListener("change", () => {
    toggleProblemCheckboxes(allProblems.checked);
  });

  document.getElementById("problems-list")!.addEventListener("change", (e) => {
    const allProblemsEl = document.getElementById("all-problems") as HTMLInputElement;
    if (allProblemsEl?.checked) {
      const target = e.target as HTMLInputElement;
      if (target.matches("#problems-list input[type=checkbox]")) {
        target.checked = true;
      }
      return;
    }
    syncWorldCountToTasks();
    document.getElementById("problems-fieldset")?.classList.remove("field-error");
    updateDurationHint();
  });

  document.getElementById("slot-input")!.addEventListener("input", () => updateDurationHint());
  document.getElementById("duration-input")!.addEventListener("input", () => updateDurationHint());

  runForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const config = readFormConfig();
    clearFieldErrors();
    updateDurationHint();
    const validation = validateRunConfig(config);
    if (validation) {
      markFieldError(validation.field);
      alert(validation.error);
      return;
    }
    const res = await fetch("/api/bench/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || body.error) {
      alert(body.error ?? "Failed to start benchmark");
      return;
    }
    startLivePoll();
    await updateRunControls();
  });

  stopBtn.addEventListener("click", async () => {
    const res = await fetch("/api/bench/stop", { method: "POST" });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    if (!body.ok) alert(body.error ?? "Failed to stop");
    await updateRunControls();
  });

  watchLiveBtn.addEventListener("click", () => {
    startLivePoll();
  });

  select.addEventListener("change", () => loadSelectedRun(select));

  refreshBtn.addEventListener("click", async () => {
    await populateSelect(select);
    if (watchingLive) await pollLive();
    else await loadSelectedRun(select);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    file.text().then((t) => parseFile(t, file.name)).catch((e) => alert(String(e)));
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    file.text().then((t) => parseFile(t, file.name)).catch((err) => alert(String(err)));
  });

  dropZone.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).tagName !== "INPUT") fileInput.click();
  });

  const params = new URLSearchParams(location.search);
  const run = params.get("run");
  if (run === LIVE_FILE) {
    startLivePoll();
  } else if (run && [...select.options].some((o) => o.value === run)) {
    select.value = run;
    await loadSelectedRun(select);
  } else {
    try {
      const live = await fetchRun(LIVE_FILE);
      const bench = await fetchBenchStatus();
      if ((live.status === "starting" || live.status === "running") && bench?.running) {
        startLivePoll();
      } else if (live.status === "complete" && live.slots?.length) {
        showResults(live, live.resultsFile ?? LIVE_FILE);
        if (live.resultsFile) select.value = live.resultsFile;
      } else if (
        live.status === "starting" ||
        (live.status === "running" && !bench?.running && !live.slots?.length)
      ) {
        await loadLatestResult();
      }
    } catch {
      // no live run
    }
  }
}

init();
