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
    if (row.length !== width) {
      throw new Error("maze rows must have equal width");
    }
    for (let x = 0; x < row.length; x++) {
      const cell = row[x]!;
      if (cell === "S") start = { x, y };
      if (cell === "E") exit = { x, y };
    }
  }

  if (!start || !exit) {
    throw new Error("maze must contain S (start) and E (exit)");
  }

  return { rows, height: rows.length, width, start, exit };
}

export function cellAt(grid: MazeGrid, pos: MazePosition): string {
  return grid.rows[pos.y]![pos.x]!;
}

export function isWalkable(cell: string): boolean {
  return cell !== "#";
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

export function tryMove(
  grid: MazeGrid,
  pos: MazePosition,
  direction: string,
): { ok: boolean; pos: MazePosition; atExit: boolean; message?: string } {
  const dir = direction.toUpperCase();
  const delta = DELTAS[dir];
  if (!delta) {
    return { ok: false, pos, atExit: false, message: `invalid direction: ${direction}` };
  }

  const next = { x: pos.x + delta.x, y: pos.y + delta.y };
  if (next.y < 0 || next.y >= grid.height || next.x < 0 || next.x >= grid.width) {
    return { ok: false, pos, atExit: false, message: "move blocked by maze boundary" };
  }

  const cell = cellAt(grid, next);
  if (!isWalkable(cell)) {
    return { ok: false, pos, atExit: false, message: "move blocked by wall" };
  }

  const atExit = next.x === grid.exit.x && next.y === grid.exit.y;
  return { ok: true, pos: next, atExit };
}

export function simulatePath(
  grid: MazeGrid,
  path: string,
): { ok: boolean; message: string } {
  const moves = path.toUpperCase().replace(/[^NSEWUDRL]/g, "");
  if (moves.length === 0) {
    return { ok: false, message: "path must contain N,S,E,W moves" };
  }

  let pos = { ...grid.start };
  if (!isWalkable(cellAt(grid, pos))) {
    return { ok: false, message: "invalid start cell" };
  }

  for (const dir of moves) {
    const step = tryMove(grid, pos, dir);
    if (!step.ok) {
      return { ok: false, message: step.message ?? "invalid move" };
    }
    pos = step.pos;
  }

  if (pos.x !== grid.exit.x || pos.y !== grid.exit.y) {
    return { ok: false, message: "path does not end at exit E" };
  }

  return { ok: true, message: "path reaches exit" };
}
