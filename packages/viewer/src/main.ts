import type {
  BenchResults,
  BenchStartRequest,
  BenchStatus,
  MetaResponse,
} from "./types.js";
import { renderResults } from "./render.js";

const LIVE_FILE = "live.json";
const POLL_MS = 1000;

const app = document.getElementById("app")!;
let meta: MetaResponse | null = null;
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
            <label>Model<input id="model-input" name="model" type="text" required /></label>
            <label>Slot (ms)<input id="slot-input" name="slotMs" type="number" min="1000" step="1000" required /></label>
            <label>Duration (sec)<input id="duration-input" name="durationSec" type="number" min="10" step="5" required /></label>
            <label>Seed<input id="seed-input" name="benchSeed" type="number" required /></label>
            <label>Task pack<select id="pack-select" name="taskPack"></select></label>
            <label>Worlds<input id="worlds-input" name="worldCount" type="number" min="1" max="8" required /></label>
          </div>
          <fieldset class="problems-fieldset">
            <legend>Problems</legend>
            <div id="problems-list" class="problems-checkboxes"></div>
            <label class="checkbox-inline"><input type="checkbox" id="all-problems" checked /> All problems in pack</label>
          </fieldset>
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

async function fetchMeta() {
  const res = await fetch("/api/meta");
  if (!res.ok) throw new Error("Failed to load config metadata");
  meta = (await res.json()) as MetaResponse;
}

async function fetchRunList() {
  const res = await fetch("/api/runs");
  if (!res.ok) return [];
  return (await res.json()) as string[];
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

function showResults(data: BenchResults, label: string) {
  const content = document.getElementById("content")!;
  content.innerHTML = renderResults(data, label);
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

async function pollLive() {
  try {
    const data = await fetchRun(LIVE_FILE);
    showResults(data, "live.json");
    if (data.status === "complete" || data.status === "failed" || data.status === "stopped") {
      stopLivePoll();
      watchingLive = false;
      await populateSelect(document.getElementById("run-select") as HTMLSelectElement);
      await updateRunControls();
      if (data.resultsFile) {
        const select = document.getElementById("run-select") as HTMLSelectElement;
        select.value = data.resultsFile;
      }
    }
  } catch {
    // live.json may not exist yet
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
  const files = await fetchRunList();
  select.innerHTML = '<option value="">— select —</option>';
  for (const f of files) {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f.replace(".json", "").replace("T", " ");
    select.appendChild(opt);
  }
  if (previous && files.includes(previous)) select.value = previous;
}

function fillProblemsForPack(packId: string, selected?: string[]) {
  const container = document.getElementById("problems-list")!;
  const pack = meta?.taskPacks.find((p) => p.id === packId);
  container.innerHTML = "";
  if (!pack) return;

  for (const problem of pack.problems) {
    const label = document.createElement("label");
    label.className = "checkbox-inline";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "problem";
    input.value = problem.id;
    input.checked = selected ? selected.includes(problem.id) : true;
    input.disabled = (document.getElementById("all-problems") as HTMLInputElement).checked;
    label.appendChild(input);
    label.append(` ${problem.id}`);
    container.appendChild(label);
  }
}

function applyProfile(profileId: string) {
  if (!meta || !profileId) return;
  const profile = meta.profiles.find((p) => p.id === profileId);
  if (!profile) return;

  (document.getElementById("model-input") as HTMLInputElement).value = profile.model ?? meta.defaults.model;
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
    model: (document.getElementById("model-input") as HTMLInputElement).value.trim(),
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

  (document.getElementById("model-input") as HTMLInputElement).value = meta.defaults.model;
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
  await fetchMeta();
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
      if (live.status === "starting" || live.status === "running") startLivePoll();
    } catch {
      // no live run
    }
  }
}

init();
