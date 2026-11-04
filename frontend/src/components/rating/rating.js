import { ratingService } from "../../ratings/rating-service.js";

const MIN_RATING = 1;
const MAX_RATING = 10;
const STEP = 0.5;
const NEUTRAL_RATING = 5;

const format = (value) => Number(value).toFixed(1);

const clamp = (value) => Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round(value / STEP) * STEP));

/**
 * Personal rating control.
 *
 * The layout follows the project's rating reference: an external TMDB score, the
 * user's own score, a direct-entry field and a save action. The component owns
 * only the draft value; the server response is the source of truth for the
 * confirmed value.
 *
 * @param {object} options
 * @param {object} options.media          Media identity payload for the API.
 * @param {number|null} options.rating    Confirmed rating, if any.
 * @param {number} options.tmdbRating     External TMDB score, shown read-only.
 * @param {Function} [options.onSaved]    Called with the updated item.
 */
export function createRatingControl({ media, rating = null, itemId = null, tmdbRating = 0, onSaved } = {}) {
  let confirmed = typeof rating === "number" ? rating : null;
  let draft = confirmed ?? NEUTRAL_RATING;
  let relationshipId = itemId;
  let busy = false;

  const element = document.createElement("section");
  element.className = "rating-panel";
  element.setAttribute("aria-label", "Your rating");
  element.innerHTML = `
    <div class="rating-panel-heading">
      <p class="eyebrow">Your score</p>
      <h3>Rate this title</h3>
    </div>
    <dl class="rating-panel-metrics">
      <div class="rating-metric">
        <dt>TMDB rating</dt>
        <dd class="rating-metric-external" data-tmdb-rating></dd>
      </div>
      <div class="rating-metric">
        <dt>Your rating</dt>
        <dd class="rating-metric-personal" data-rating-readout></dd>
      </div>
    </dl>
    <label class="rating-entry-label" for="personal-rating-input">Your score <span>(1–10)</span></label>
    <div class="rating-entry">
      <input id="personal-rating-input" class="rating-input" type="number" min="1" max="10" step="0.5" inputmode="decimal" aria-label="Your rating from 1 to 10 in half-point steps" data-rating-input>
      <span class="rating-stepper-scale">/ 10</span>
    </div>
    <button class="button button-primary rating-save" type="button" data-rating-save>Save rating</button>
    <button class="rating-clear" type="button" data-rating-clear hidden>Remove rating</button>
    <p class="rating-status" role="status" aria-live="polite" data-rating-status></p>
  `;

  const readout = element.querySelector("[data-rating-readout]");
  const tmdbReadout = element.querySelector("[data-tmdb-rating]");
  const input = element.querySelector("[data-rating-input]");
  const saveButton = element.querySelector("[data-rating-save]");
  const clearButton = element.querySelector("[data-rating-clear]");
  const status = element.querySelector("[data-rating-status]");

  tmdbReadout.textContent = tmdbRating > 0 ? `${format(tmdbRating)} / 10` : "Not rated";

  function setStatus(message, tone = "") {
    status.textContent = message;
    status.className = tone ? `rating-status rating-status-${tone}` : "rating-status";
  }

  function paint() {
    readout.textContent = confirmed === null ? "Not rated" : `${format(confirmed)} / 10`;
    input.value = format(draft);
    input.disabled = busy;
    saveButton.disabled = busy || !input.validity.valid || (confirmed !== null && confirmed === draft);
    saveButton.textContent = confirmed !== null && confirmed !== draft ? "Update rating" : "Save rating";
    clearButton.hidden = confirmed === null;
    clearButton.disabled = busy;
    element.setAttribute("aria-busy", String(busy));
  }

  input.addEventListener("input", () => {
    if (input.value === "" || !input.validity.valid) {
      saveButton.disabled = true;
      return;
    }
    draft = clamp(Number(input.value));
    setStatus("");
    saveButton.disabled = busy || (confirmed !== null && confirmed === draft);
  });

  async function save() {
    if (busy) return;
    if (input.value === "" || !input.validity.valid) {
      setStatus("Enter a score from 1.0 to 10.0.", "error");
      input.focus();
      return;
    }
    draft = clamp(Number(input.value));
    const previous = confirmed;
    const attempted = draft;
    busy = true;
    setStatus("Saving your rating…");
    paint();
    try {
      const saved = await ratingService.setForMedia(media, attempted);
      relationshipId = saved.id;
      confirmed = typeof saved.rating === "number" ? saved.rating : null;
      draft = confirmed ?? attempted;
      setStatus(`Saved. Your rating is ${format(confirmed)}/10.`, "success");
      onSaved?.(saved);
    } catch (error) {
      // Roll the confirmed value back so the readout never shows an unsaved score.
      confirmed = previous;
      setStatus(error.message, "error");
    } finally {
      busy = false;
      paint();
    }
  }

  async function clear() {
    if (busy) return;
    if (confirmed === null) {
      draft = NEUTRAL_RATING;
      paint();
      return;
    }
    busy = true;
    setStatus("Removing your rating…");
    paint();
    try {
      await ratingService.remove(relationshipId);
      confirmed = null;
      draft = NEUTRAL_RATING;
      setStatus("Rating removed.", "success");
      onSaved?.(null);
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      busy = false;
      paint();
    }
  }

  saveButton.addEventListener("click", save);
  clearButton.addEventListener("click", clear);

  paint();

  return {
    element,
    get rating() {
      return confirmed;
    },
    refresh(item) {
      relationshipId = item?.id ?? relationshipId;
      confirmed = typeof item?.rating === "number" ? item.rating : null;
      draft = confirmed ?? NEUTRAL_RATING;
      paint();
    }
  };
}
