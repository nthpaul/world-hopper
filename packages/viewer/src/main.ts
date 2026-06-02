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
          <div class="form-row">
            <label for="profile-select">Profile</label>
            <select id="profile-select">
              <option value="">Custom</option>
            </select>
          </div>
          <div class="form-grid">
            <label>Model<select id="model-select" name="model" required></select></label>
            <label>Slot (ms)<input id="slot-input" name="slotMs" type="number" min="1000" step="1000" required /></label>
            <label>Duration (sec)<input id="duration-input" name="durationSec" type="number" min="10" step="5" required /></label>
            <label>Seed<input id="seed-input" name="benchSeed" type="number" required /></label>
            <label>Task pack<select id="pack-select" name="taskPack"></select></label>
            <label>Worlds<input id="worlds-input" name="worldCount" type="number" min="1" max="8" required /></label>
          </div>
          <fieldset class="problems-fieldset">
            <legend>Tasks for this run</legend>
            <div id="problems-list" class="problems-checkboxes"></div>
            <label class="checkbox-inline"><input type="checkbox" id="all-problems" checked /> All tasks in pack</label>
          </fieldset>
          <div id="pack-tasks-reference" class="pack-tasks-reference"></div>
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
  content.innerHTML = renderResults(data, data.runName ?? label, runProblems(data));
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
    <p class="pack-tasks-intro">Each world container loads these tasks. The agent must read files and call <code>submit</code> to score.</p>
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
    label.className = "problem-option";
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
}

function applyProfile(profileId: string) {
  if (!meta || !profileId) return;
  const profile = meta.profiles.find((p) => p.id === profileId);
  if (!profile) return;

  (document.getElementById("model-select") as HTMLSelectElement).value = resolveModelId(
    profile.model ?? meta.defaults.model,
  );
  (document.getElementById("slot-input") as HTMLInputElement).value = String(
    profile.slotMs ?? meta.defaults.slotMs,
  );
  (document.getElementById("duration-input") as HTMLInputElement).value = String(
    profile.durationSec ?? meta.defaults.durationSec,
  );
  (document.getElementById("seed-input") as HTMLInputElement).value = String(
    profile.benchSeed ?? meta.defaults.benchSeed,
  );
  (document.getElementById("pack-select") as HTMLSelectElement).value =
    profile.taskPack ?? meta.defaults.taskPack;
  (document.getElementById("worlds-input") as HTMLInputElement).value = String(
    profile.worldCount ?? meta.defaults.worldCount,
  );

  const allProblems = document.getElementById("all-problems") as HTMLInputElement;
  allProblems.checked = !profile.problems?.length;
  fillProblemsForPack(profile.taskPack ?? meta.defaults.taskPack, profile.problems);
  toggleProblemCheckboxes(allProblems.checked);
}

function toggleProblemCheckboxes(all: boolean) {
  for (const input of document.querySelectorAll<HTMLInputElement>("#problems-list input")) {
    input.disabled = all;
    if (all) input.checked = true;
  }
}

function readFormConfig(): BenchStartRequest {
  const profileSelect = document.getElementById("profile-select") as HTMLSelectElement;
  const allProblems = (document.getElementById("all-problems") as HTMLInputElement).checked;
  const problems = allProblems
    ? undefined
    : [...document.querySelectorAll<HTMLInputElement>("#problems-list input:checked")].map(
        (el) => el.value,
      );

  return {
    profile: profileSelect.value || undefined,
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

  const profileSelect = document.getElementById("profile-select") as HTMLSelectElement;
  for (const profile of meta.profiles) {
    const opt = document.createElement("option");
    opt.value = profile.id;
    opt.textContent = profile.name ?? profile.id;
    profileSelect.appendChild(opt);
  }

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
  const profileSelect = document.getElementById("profile-select") as HTMLSelectElement;
  const packSelect = document.getElementById("pack-select") as HTMLSelectElement;
  const allProblems = document.getElementById("all-problems") as HTMLInputElement;
  const stopBtn = document.getElementById("stop-btn")!;
  const watchLiveBtn = document.getElementById("watch-live-btn")!;

  await populateSelect(select);
  await updateRunControls();
  setInterval(() => void updateRunControls(), 3000);

  profileSelect.addEventListener("change", () => {
    if (profileSelect.value) applyProfile(profileSelect.value);
  });

  packSelect.addEventListener("change", () => {
    fillProblemsForPack(packSelect.value);
  });

  allProblems.addEventListener("change", () => {
    toggleProblemCheckboxes(allProblems.checked);
  });

  runForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const config = readFormConfig();
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
