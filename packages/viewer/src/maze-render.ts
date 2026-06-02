export type MazeGrid = {
  rows: string[];
  height: number;
  width: number;
  start: { x: number; y: number };
  exit: { x: number; y: number };
};

export type MazePosition = { x: number; y: number };

export function parseMaze(content: string): MazeGrid {
  const rows = content
    .trimEnd()
    .split("\n")
    .map((line) => line.replace(/\r$/, ""));

  if (rows.length === 0) {
    throw new Error("empty maze");
  }

  const width = rows[0]!.length;
  let start: MazePosition | undefined;
  let exit: MazePosition | undefined;

  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const cell = row[x]!;
      if (cell === "S") start = { x, y };
      if (cell === "E") exit = { x, y };
    }
  }

  if (!start || !exit) {
    throw new Error("maze must contain S and E");
  }

  return { rows, height: rows.length, width, start, exit };
}

const DELTAS: Record<string, MazePosition> = {
  N: { x: 0, y: -1 },
  U: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  D: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  R: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  L: { x: -1, y: 0 },
};

function isWalkable(cell: string): boolean {
  return cell !== "#";
}

export function pathPositions(grid: MazeGrid, path: string): MazePosition[] {
  const moves = path.toUpperCase().replace(/[^NSEWUDRL]/g, "");
  const positions: MazePosition[] = [{ ...grid.start }];
  let pos = { ...grid.start };

  for (const dir of moves) {
    const delta = DELTAS[dir];
    if (!delta) continue;
    const next = { x: pos.x + delta.x, y: pos.y + delta.y };
    if (next.y < 0 || next.y >= grid.height || next.x < 0 || next.x >= grid.width) continue;
    const cell = grid.rows[next.y]![next.x]!;
    if (!isWalkable(cell)) continue;
    pos = next;
    positions.push({ ...pos });
  }

  return positions;
}

export type MazeRenderOptions = {
  layoutText: string;
  path?: string;
  position?: MazePosition;
  atExit?: boolean;
  problemId?: string;
};

export function renderMazeGrid(options: MazeRenderOptions): string {
  let grid: MazeGrid;
  try {
    grid = parseMaze(options.layoutText);
  } catch {
    return `<div class="maze-error">Invalid maze layout</div>`;
  }

  const trail = new Set<string>();
  const pathPositionsList = options.path ? pathPositions(grid, options.path) : [];
  for (const pos of pathPositionsList) {
    trail.add(`${pos.x},${pos.y}`);
  }

  const agentPos =
    options.position ??
    (pathPositionsList.length > 0 ? pathPositionsList[pathPositionsList.length - 1] : grid.start);

  const cells: string[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const base = grid.rows[y]![x]!;
      const key = `${x},${y}`;
      const isAgent = agentPos.x === x && agentPos.y === y;
      const isTrail = trail.has(key) && !isAgent;
      let display = base;
      let className = "maze-cell";

      if (base === "#") {
        className += " maze-wall";
        display = "";
      } else if (isAgent) {
        className += options.atExit ? " maze-agent maze-agent-exit" : " maze-agent";
        display = options.atExit ? "★" : "@";
      } else if (isTrail) {
        className += " maze-trail";
        display = "·";
      } else if (base === "S") {
        className += " maze-start";
        display = "S";
      } else if (base === "E") {
        className += " maze-exit";
        display = "E";
      } else {
        className += " maze-floor";
        display = " ";
      }

      cells.push(
        `<div class="${className}" style="grid-column:${x + 1};grid-row:${y + 1}" title="(${x},${y})">${display}</div>`,
      );
    }
  }

  const title = options.problemId ? `<div class="maze-title">${options.problemId}</div>` : "";
  const pathLabel =
    options.path ?
      `<div class="maze-path-label">Path: <code>${options.path || "—"}</code></div>`
    : "";

  return `
    <div class="maze-panel">
      ${title}
      <div class="maze-grid" style="grid-template-columns:repeat(${grid.width},1.4rem);grid-template-rows:repeat(${grid.height},1.4rem)">
        ${cells.join("")}
      </div>
      ${pathLabel}
    </div>
  `;
}
