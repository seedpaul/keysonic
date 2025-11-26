// components/pad-grid.js

export function createPadGrid({
  container,
  rows = 8,
  cols = 10,
  onPadDown = null,
  onPadUp = null,
  getCodeForIndex = null,
  getHueForCode = null,
} = {}) {
  if (!container) {
    return { gridEl: null, cells: [], destroy() {} };
  }

  container.innerHTML = "";
  const gridEl = document.createElement("div");
  gridEl.className = "pad-grid";
  gridEl.setAttribute("role", "grid");

  const cells = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "pad-cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.dataset.index = String(index);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `Pad ${row + 1}-${col + 1}`);
      cell.dataset.down = "0";

      const code =
        typeof getCodeForIndex === "function" ? getCodeForIndex(index) : null;
      if (code) {
        const label = formatCodeLabel(code);
        if (label) {
          cell.textContent = label;
          cell.setAttribute("aria-label", `${label} pad ${row + 1}-${col + 1}`);
        }
      }
      if (code) {
        cell.dataset.code = code;
        const hue =
          typeof getHueForCode === "function" ? getHueForCode(code) : null;
        if (Number.isFinite(hue)) {
          cell.dataset.hue = String(hue);
        }
      }

      const activate = (ev) => {
        if (cell.dataset.down === "1") return;
        cell.dataset.down = "1";
        cell.classList.add("pad-cell--held", "pad-cell--active");
        if (typeof cell.setPointerCapture === "function" && ev?.pointerId !== undefined) {
          try {
            cell.setPointerCapture(ev.pointerId);
          } catch (err) {
            // ignore pointer capture failures
          }
        }
        if (typeof onPadDown === "function") {
          onPadDown({ row, col, index, code: code || null, el: cell });
        }
      };

      const release = (ev) => {
        if (cell.dataset.down !== "1") return;
        cell.dataset.down = "0";
        cell.classList.remove("pad-cell--held");
        if (typeof cell.releasePointerCapture === "function" && ev?.pointerId !== undefined) {
          try {
            cell.releasePointerCapture(ev.pointerId);
          } catch (err) {
            // ignore pointer capture failures
          }
        }
        if (typeof onPadUp === "function") {
          onPadUp({ row, col, index, code: code || null, el: cell });
        }
      };

      cell.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        activate(ev);
      });
      cell.addEventListener("pointerup", (ev) => {
        ev.preventDefault();
        release(ev);
      });
      cell.addEventListener("pointercancel", (ev) => {
        release(ev);
      });
      cell.addEventListener("pointerleave", (ev) => {
        release(ev);
      });

      gridEl.appendChild(cell);
      cells.push({ row, col, index, code: code || null, el: cell });
    }
  }

  container.appendChild(gridEl);

  return {
    gridEl,
    cells,
    destroy() {
      container.innerHTML = "";
    },
  };
}

function formatCodeLabel(code) {
  if (!code || typeof code !== "string") return "";
  if (code === " ") return "Space";
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowDown") return "↓";
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowRight") return "→";
  if (code.startsWith("Numpad") && code.length > 6) {
    const tail = code.slice(6);
    if (tail === "Multiply") return "*";
    if (tail === "Divide") return "/";
    if (tail === "Add") return "+";
    if (tail === "Subtract") return "-";
    if (tail === "Decimal") return ".";
    return tail;
  }
  if (code.length === 1) return code.toUpperCase();
  return code;
}
