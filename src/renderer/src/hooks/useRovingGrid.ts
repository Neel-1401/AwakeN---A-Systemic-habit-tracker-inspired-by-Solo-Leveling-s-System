import { useRef, useState, type KeyboardEvent } from 'react';

type Cell = [row: number, col: number];

/**
 * Keyboard movement for a 2-D grid of focusable cells, using a "roving tabindex": only one cell
 * is in the Tab order (tabIndex 0), and the arrow keys move focus between cells. That way Tab
 * enters and leaves the grid in one step instead of stopping on hundreds of squares.
 *
 * Cells need data-row and data-col attributes. `exists` says whether a position has a cell
 * (the year heatmap has gaps before 1 January and after 31 December).
 */
export function useRovingGrid(
  rows: number,
  cols: number,
  initial: Cell,
  exists: (row: number, col: number) => boolean = () => true,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Cell>(initial);
  // Keep the active cell inside the grid if it shrinks (a habit archived, a shorter month).
  const [row, col] = [Math.min(active[0], rows - 1), Math.min(active[1], cols - 1)];

  function focusCell(next: Cell) {
    setActive(next);
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-row="${next[0]}"][data-col="${next[1]}"]`)
      ?.focus();
  }

  /** Steps from the current cell, skipping gaps, and stops at the edge. */
  function step(dr: number, dc: number): Cell | null {
    for (let r = row + dr, c = col + dc; r >= 0 && r < rows && c >= 0 && c < cols; r += dr, c += dc) {
      if (exists(r, c)) return [r, c];
    }
    return null;
  }

  function firstInRow(r: number, fromEnd: boolean): Cell | null {
    for (let i = 0; i < cols; i++) {
      const c = fromEnd ? cols - 1 - i : i;
      if (exists(r, c)) return [r, c];
    }
    return null;
  }

  function onKeyDown(event: KeyboardEvent) {
    const moves: Record<string, () => Cell | null> = {
      ArrowRight: () => step(0, 1),
      ArrowLeft: () => step(0, -1),
      ArrowDown: () => step(1, 0),
      ArrowUp: () => step(-1, 0),
      Home: () => firstInRow(row, false),
      End: () => firstInRow(row, true),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = move();
    if (next) focusCell(next);
  }

  return {
    containerRef,
    onKeyDown,
    tabIndexFor: (r: number, c: number) => (r === row && c === col ? 0 : -1),
    /** Call from a cell's onFocus so clicking a cell also moves the roving position. */
    setActive: (r: number, c: number) => setActive([r, c]),
  };
}
