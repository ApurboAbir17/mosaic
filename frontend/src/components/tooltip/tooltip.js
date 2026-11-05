const HOVER_DELAY = 100;
const GAP = 8;

let tooltip = null;
let timer = null;
let currentTarget = null;

function ensureTooltip() {
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  tooltip.style.position = "fixed";
  tooltip.style.pointerEvents = "none";
  tooltip.style.zIndex = "60";
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionTooltip(target) {
  const rect = target.getBoundingClientRect();
  const { innerWidth: vw, innerHeight: vh } = window;
  const position = target.dataset.tooltipPosition || "top";

  tooltip.hidden = false;
  const style = window.getComputedStyle(tooltip);
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;

  let left = 0;
  let top = 0;

  const candidates = {
    top: { left: rect.left + rect.width / 2 - tw / 2, top: rect.top - th - GAP },
    bottom: { left: rect.left + rect.width / 2 - tw / 2, top: rect.bottom + GAP },
    left: { left: rect.left - tw - GAP, top: rect.top + rect.height / 2 - th / 2 },
    right: { left: rect.right + GAP, top: rect.top + rect.height / 2 - th / 2 }
  };

  let placement = position;
  if (!candidates[position]) placement = "top";

  const tryPlacement = (p) => {
    const c = candidates[p];
    const fitsHoriz = c.left >= 8 && c.left + tw <= vw - 8;
    const fitsVert = c.top >= 8 && c.top + th <= vh - 8;
    return fitsHoriz && fitsVert;
  };

  if (!tryPlacement(placement)) {
    const order = placement === "top" || placement === "bottom"
      ? ["bottom", "top", "left", "right"]
      : ["right", "left", "top", "bottom"];
    for (const p of order) {
      if (tryPlacement(p)) { placement = p; break; }
    }
  }

  const c = candidates[placement];
  left = Math.min(Math.max(c.left, 8), vw - tw - 8);
  top = Math.min(Math.max(c.top, 8), vh - th - 8);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.dataset.placement = placement;
}

function show(target) {
  if (currentTarget === target && !tooltip.hidden) return;
  const text = target.dataset.tooltip;
  if (!text) return;
  currentTarget = target;
  tooltip.textContent = text;
  positionTooltip(target);
}

function hide() {
  if (timer) { clearTimeout(timer); timer = null; }
  currentTarget = null;
  tooltip.hidden = true;
}

function scheduleShow(target) {
  if (timer) { clearTimeout(timer); timer = null; }
  timer = setTimeout(() => { timer = null; show(target); }, HOVER_DELAY);
}

function handleMouseEnter(event) {
  const target = event.target.closest("[data-tooltip]");
  if (!target) return;
  scheduleShow(target);
}

function handleMouseLeave(event) {
  const target = event.target.closest("[data-tooltip]");
  if (!target) return;
  if (timer) { clearTimeout(timer); timer = null; }
  if (currentTarget === target) hide();
}

function handleFocusIn(event) {
  const target = event.target.closest("[data-tooltip]");
  if (!target) return;
  if (timer) { clearTimeout(timer); timer = null; }
  show(target);
}

function handleFocusOut(event) {
  const target = event.target.closest("[data-tooltip]");
  if (!target) return;
  if (currentTarget === target) hide();
}

function handleKeydown(event) {
  if (event.key === "Escape" && tooltip && !tooltip.hidden) {
    hide();
  }
}

function init() {
  ensureTooltip();
  document.addEventListener("mouseenter", handleMouseEnter, true);
  document.addEventListener("mouseleave", handleMouseLeave, true);
  document.addEventListener("focusin", handleFocusIn, true);
  document.addEventListener("focusout", handleFocusOut, true);
  document.addEventListener("keydown", handleKeydown);
}

init();

export { hide };
