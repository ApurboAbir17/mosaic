import { reviewService } from "../../reviews/review-service.js";

const MIN_BODY = 10;
const MAX_BODY = 5000;

/**
 * Shared review editor for media details and the signed-in Reviews page.
 * Existing legacy titles are displayed read-only and included in updates so
 * editing a review never clears data from before the title field was removed.
 *
 * @param {object} options
 * @param {object} options.media Media identity payload for a new review.
 * @param {object|null} options.review Existing review, if editing.
 * @param {boolean} [options.startInEditMode] Start editing an existing review.
 * @param {Function} [options.onSaved]
 * @param {Function} [options.onDeleted]
 * @param {Function} [options.onCancel]
 */
export function createReviewEditor({
  media,
  review = null,
  startInEditMode = false,
  onSaved,
  onDeleted,
  onCancel
} = {}) {
  let current = review ? { ...review } : null;
  let editing = !current || startInEditMode;
  let busy = false;

  const element = document.createElement("form");
  element.className = "review-editor";
  element.noValidate = true;
  element.setAttribute("aria-label", current ? "Your saved review" : "Write a review");
  element.innerHTML = `
    <div class="review-editor-heading">
      <p class="eyebrow">Your review</p>
      <h3 data-heading>${current ? "Your review" : "Write a review"}</h3>
    </div>
    <p class="review-editor-saved" data-saved-state hidden></p>
    <div class="review-legacy-title" data-legacy-title hidden>
      <span class="field-label">Saved title (preserved)</span>
      <p data-legacy-title-value></p>
    </div>
    <div class="review-body-row">
      <label class="field-label" id="review-body-label" for="review-body-input">
        Your review <span class="review-length-guidance" data-length-guidance>${MIN_BODY}–${MAX_BODY} characters</span>
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
    <button class="button button-primary review-submit" type="submit" data-submit data-tooltip="Publish review">Publish review</button>
    <div class="review-actions" data-review-actions hidden>
      <button class="button button-primary" type="button" data-actions-toggle
        aria-haspopup="menu" aria-expanded="false" data-tooltip="Review actions">Review actions</button>
      <div class="review-action-menu" role="menu" data-actions-menu hidden>
        <button type="button" role="menuitem" data-action="edit">Edit review</button>
        <button type="button" role="menuitem" data-action="save">Save changes</button>
        <button type="button" role="menuitem" data-action="cancel">Cancel editing</button>
        <button type="button" role="menuitem" data-action="delete">Delete review</button>
      </div>
    </div>
    <p class="review-status" role="status" aria-live="polite" data-status></p>
  `;

  const bodyInput = element.querySelector("[data-body]");
  const counter = element.querySelector("[data-counter]");
  const validation = element.querySelector("[data-validation]");
  const visibilityInputs = [...element.querySelectorAll("[data-visibility]")];
  const spoilerInput = element.querySelector("[data-spoilers]");
  const submitButton = element.querySelector("[data-submit]");
  const actions = element.querySelector("[data-review-actions]");
  const actionsToggle = element.querySelector("[data-actions-toggle]");
  const actionsMenu = element.querySelector("[data-actions-menu]");
  const editAction = element.querySelector('[data-action="edit"]');
  const saveAction = element.querySelector('[data-action="save"]');
  const cancelAction = element.querySelector('[data-action="cancel"]');
  const deleteAction = element.querySelector('[data-action="delete"]');
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
    bodyInput.readOnly = busy || Boolean(current && !editing);
    visibilityInputs.forEach((input) => {
      input.disabled = Boolean(current && !editing) || busy;
    });
    spoilerInput.disabled = Boolean(current && !editing) || busy;
    submitButton.hidden = Boolean(current);
    submitButton.disabled = busy || !valid || !isDirty();
    actions.hidden = !current;
    actionsToggle.disabled = busy;
    editAction.hidden = editing;
    saveAction.hidden = !editing;
    saveAction.disabled = busy || !valid || !isDirty();
    cancelAction.hidden = !editing;
    deleteAction.disabled = busy;
    element.setAttribute("aria-busy", String(busy));
  }

  function closeActionsMenu({ restoreFocus = false } = {}) {
    actionsMenu.hidden = true;
    actionsToggle.setAttribute("aria-expanded", "false");
    if (restoreFocus) actionsToggle.focus();
  }

  function openActionsMenu() {
    actionsMenu.hidden = false;
    actionsToggle.setAttribute("aria-expanded", "true");
    actionsMenu.querySelector('[role="menuitem"]:not([hidden])')?.focus();
  }

  function moveMenuFocus(event) {
    const items = [...actionsMenu.querySelectorAll('[role="menuitem"]:not([hidden]):not(:disabled)')];
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    else if (event.key === "ArrowUp") nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else return;
    event.preventDefault();
    items[nextIndex].focus();
  }

  function load(review, editMode = !review) {
    current = review ? { ...review } : null;
    editing = !current || editMode;
    element.reset();
    if (!current) {
      heading.textContent = "Write a review";
      element.setAttribute("aria-label", "Write a review");
      savedState.hidden = true;
      legacyTitle.hidden = true;
      legacyTitleValue.textContent = "";
      closeActionsMenu();
      setStatus("");
      paint();
      return;
    }

    bodyInput.value = current.body ?? "";
    visibilityInputs.forEach((input) => {
      input.checked = input.value === current.visibility;
    });
    spoilerInput.checked = Boolean(current.contains_spoilers);
    heading.textContent = editing ? "Edit your review" : "Your review";
    element.setAttribute("aria-label", editing ? "Edit your review" : "Your saved review");
    savedState.textContent = `Saved as ${current.visibility === "public" ? "Public" : "Private"}${current.contains_spoilers ? " · Contains spoilers" : ""}.`;
    savedState.hidden = false;
    legacyTitleValue.textContent = current.title ?? "";
    legacyTitle.hidden = !current.title;
    closeActionsMenu();
    setStatus("");
    paint();
  }

  function handleInput() {
    setStatus("");
    paint();
  }

  async function removeReview() {
    if (busy || !current) return;
    const title = current.media?.title ?? media?.title ?? "this title";
    if (!window.confirm(`Delete your review of “${title}”? This cannot be undone.`)) return;

    closeActionsMenu();
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
  }

  bodyInput.addEventListener("input", handleInput);
  spoilerInput.addEventListener("change", handleInput);
  visibilityInputs.forEach((input) => input.addEventListener("change", handleInput));

  actionsToggle.addEventListener("click", () => {
    if (actionsMenu.hidden) openActionsMenu();
    else closeActionsMenu();
  });

  actionsMenu.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "edit") {
      load(current, true);
      return;
    }
    if (action === "cancel") {
      load(current, false);
      onCancel?.();
      return;
    }
    if (action === "delete") {
      await removeReview();
      return;
    }
    if (action === "save") {
      closeActionsMenu();
      element.requestSubmit();
    }
  });

  actionsMenu.addEventListener("keydown", moveMenuFocus);

  element.addEventListener("click", (event) => {
    if (event.target instanceof Element && !event.target.closest(".review-actions")) {
      closeActionsMenu();
    }
  });

  element.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !actionsMenu.hidden) {
      event.preventDefault();
      closeActionsMenu({ restoreFocus: true });
    }
  });

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
      editing = false;
      heading.textContent = "Your review";
      element.setAttribute("aria-label", "Your saved review");
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

  load(current, startInEditMode);
  return {
    element,
    refresh(nextReview) {
      load(nextReview);
    }
  };
}
