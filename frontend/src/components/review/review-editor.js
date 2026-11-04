import { reviewService } from "../../reviews/review-service.js";

const MIN_BODY = 20;
const MAX_BODY = 5000;

/**
 * Shared review editor for media details and the signed-in Reviews page.
 * Existing legacy titles are displayed read-only and included in updates so
 * editing a review never clears data from before the title field was removed.
 *
 * @param {object} options
 * @param {object} options.media Media identity payload for a new review.
 * @param {object|null} options.review Existing review, if editing.
 * @param {Function} [options.onSaved]
 * @param {Function} [options.onDeleted]
 */
export function createReviewEditor({ media, review = null, onSaved, onDeleted } = {}) {
  let current = review ? { ...review } : null;
  let busy = false;

  const element = document.createElement("form");
  element.className = "review-editor";
  element.noValidate = true;
  element.setAttribute("aria-label", current ? "Edit your review" : "Write a review");
  element.innerHTML = `
    <div class="review-editor-heading">
      <p class="eyebrow">Your review</p>
      <h3 data-heading>${current ? "Edit your review" : "Write a review"}</h3>
    </div>
    <p class="review-editor-saved" data-saved-state hidden></p>
    <div class="review-legacy-title" data-legacy-title hidden>
      <span class="field-label">Saved title (preserved)</span>
      <p data-legacy-title-value></p>
    </div>
    <div class="review-body-row">
      <label class="field-label" id="review-body-label" for="review-body-input">
        Your review <span class="review-length-guidance" data-length-guidance>20–5,000 characters</span>
      </label>
      <span class="review-counter" id="review-counter" data-counter>0/${MAX_BODY}</span>
    </div>
    <textarea id="review-body-input" class="input review-body" rows="6"
      placeholder="Write your thoughts about this title..."
      aria-describedby="review-length-guidance review-counter review-validation"
      data-body></textarea>
    <p class="review-validation" id="review-validation" data-validation aria-live="polite" hidden></p>
    <fieldset class="review-visibility">
      <legend class="field-label">Visibility</legend>
      <label class="review-choice">
        <input type="radio" name="review-visibility" value="private" data-visibility="private" checked>
        <span>Private</span>
      </label>
      <label class="review-choice">
        <input type="radio" name="review-visibility" value="public" data-visibility="public">
        <span>Public</span>
      </label>
    </fieldset>
    <label class="review-spoiler">
      <input type="checkbox" data-spoilers>
      <span>This review contains spoilers</span>
    </label>
    <button class="button button-primary review-submit" type="submit" data-submit>Publish review</button>
    <button class="button button-ghost review-delete" type="button" data-delete hidden>Delete review</button>
    <p class="review-status" role="status" aria-live="polite" data-status></p>
  `;

  const bodyInput = element.querySelector("[data-body]");
  const counter = element.querySelector("[data-counter]");
  const validation = element.querySelector("[data-validation]");
  const visibilityInputs = [...element.querySelectorAll("[data-visibility]")];
  const spoilerInput = element.querySelector("[data-spoilers]");
  const submitButton = element.querySelector("[data-submit]");
  const deleteButton = element.querySelector("[data-delete]");
  const status = element.querySelector("[data-status]");
  const heading = element.querySelector("[data-heading]");
  const savedState = element.querySelector("[data-saved-state]");
  const legacyTitle = element.querySelector("[data-legacy-title]");
  const legacyTitleValue = element.querySelector("[data-legacy-title-value]");

  function setStatus(message, tone = "") {
    status.textContent = message;
    status.className = tone ? `review-status review-status-${tone}` : "review-status";
  }

  function selectedVisibility() {
    return visibilityInputs.find((input) => input.checked)?.value ?? "private";
  }

  function formValues() {
    return {
      body: bodyInput.value.trim(),
      visibility: selectedVisibility(),
      contains_spoilers: spoilerInput.checked
    };
  }

  function isDirty() {
    const values = formValues();
    if (!current) {
      return values.body !== "" || values.visibility !== "private" || values.contains_spoilers;
    }
    return values.body !== current.body ||
      values.visibility !== current.visibility ||
      values.contains_spoilers !== Boolean(current.contains_spoilers);
  }

  function lengthError(length) {
    if (length > MAX_BODY) return `Your review is too long. Remove ${length - MAX_BODY} characters.`;
    if (bodyInput.value.length > 0 && length < MIN_BODY) {
      return length === 0
        ? `Enter at least ${MIN_BODY} non-space characters.`
        : `Add ${MIN_BODY - length} more characters to meet the minimum.`;
    }
    return "";
  }

  function paint() {
    const length = bodyInput.value.trim().length;
    const valid = length >= MIN_BODY && length <= MAX_BODY;
    const validationMessage = lengthError(length);
    counter.textContent = `${length}/${MAX_BODY}`;
    counter.classList.toggle("is-danger", !valid && (length > MAX_BODY || bodyInput.value.length > 0));
    validation.textContent = validationMessage;
    validation.hidden = !validationMessage;
    validation.classList.toggle("is-error", Boolean(validationMessage));
    submitButton.textContent = current ? "Save changes" : "Publish review";
    submitButton.disabled = busy || !valid || !isDirty();
    deleteButton.hidden = !current;
    deleteButton.disabled = busy;
    element.setAttribute("aria-busy", String(busy));
  }

  function load(review) {
    current = review ? { ...review } : null;
    element.reset();
    if (!current) {
      heading.textContent = "Write a review";
      element.setAttribute("aria-label", "Write a review");
      savedState.hidden = true;
      legacyTitle.hidden = true;
      legacyTitleValue.textContent = "";
      setStatus("");
      paint();
      return;
    }

    bodyInput.value = current.body ?? "";
    visibilityInputs.forEach((input) => {
      input.checked = input.value === current.visibility;
    });
    spoilerInput.checked = Boolean(current.contains_spoilers);
    heading.textContent = "Edit your review";
    element.setAttribute("aria-label", "Edit your review");
    savedState.textContent = `Saved as ${current.visibility === "public" ? "Public" : "Private"}${current.contains_spoilers ? " · Contains spoilers" : ""}.`;
    savedState.hidden = false;
    legacyTitleValue.textContent = current.title ?? "";
    legacyTitle.hidden = !current.title;
    setStatus("");
    paint();
  }

  function handleInput() {
    setStatus("");
    paint();
  }

  bodyInput.addEventListener("input", handleInput);
  spoilerInput.addEventListener("change", handleInput);
  visibilityInputs.forEach((input) => input.addEventListener("change", handleInput));

  element.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;

    const values = formValues();
    const lengthErrorMessage = values.body.length < MIN_BODY
      ? `Your review must contain at least ${MIN_BODY} non-space characters.`
      : values.body.length > MAX_BODY
        ? `Your review must contain no more than ${MAX_BODY} characters.`
        : "";
    if (lengthErrorMessage) {
      validation.textContent = lengthErrorMessage;
      validation.hidden = false;
      validation.classList.add("is-error");
      bodyInput.focus();
      return;
    }

    const payload = {
      // Preserve titles written before the title field was removed.
      title: current?.title ?? null,
      body: values.body,
      visibility: values.visibility,
      contains_spoilers: values.contains_spoilers
    };

    busy = true;
    setStatus(current ? "Saving your changes…" : "Publishing your review…");
    paint();
    try {
      const saved = current
        ? await reviewService.update(current.id, payload)
        : await reviewService.saveForMedia(media, payload);
      current = saved;
      heading.textContent = "Edit your review";
      element.setAttribute("aria-label", "Edit your review");
      savedState.textContent = `Saved as ${saved.visibility === "public" ? "Public" : "Private"}${saved.contains_spoilers ? " · Contains spoilers" : ""}.`;
      savedState.hidden = false;
      legacyTitleValue.textContent = saved.title ?? "";
      legacyTitle.hidden = !saved.title;
      setStatus(
        saved.visibility === "public"
          ? "Review published. It is now visible to everyone."
          : "Review saved as private. Only you can see it.",
        "success"
      );
      onSaved?.(saved);
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      busy = false;
      paint();
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (busy || !current) return;
    const title = current.media?.title ?? media?.title ?? "this title";
    if (!window.confirm(`Delete your review of “${title}”? This cannot be undone.`)) return;

    busy = true;
    setStatus("Deleting your review…");
    paint();
    try {
      await reviewService.remove(current.id);
      load(null);
      setStatus("Review deleted.", "success");
      onDeleted?.();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      busy = false;
      paint();
    }
  });

  load(current);
  return {
    element,
    refresh(review) {
      load(review);
    }
  };
}
