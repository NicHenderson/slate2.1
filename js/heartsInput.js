// The rating picker (Edit, and a show's Start / Finish): ten hearts for 1
// to 10 (css/hearts.css). There's no zero to pick: clicking the heart that
// is already the rating clears it (the owner's call).

const HEART_PATH =
  "M12.4 20.7c-2.9-1.9-8-5.5-9.3-9.2-1.2-3.4.7-6.8 3.9-7.1 2.3-.2 4.1 1 5.1 3 1.3-2.1 3.3-3.4 5.7-3.1 3.2.4 4.9 3.8 3.6 7.1-1.5 3.9-6.1 7.1-9 9.3z";

// An ink outline, and over it the color (a touch off the line, like a
// sticker) with the outline drawn again on top.
const HEART_PICK = `<span class="heart-pick">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART_PATH}" /></svg>
  <svg class="heart-pick-fill" viewBox="0 0 24 24" aria-hidden="true">
    <path class="heart-pick-color" transform="translate(1.4 1.2)" d="${HEART_PATH}" />
    <path d="${HEART_PATH}" />
  </svg>
</span>`;

const HEART_POP_STEP_MS = 45;

function createHeartsInput(pickerEl, valueEl) {
  pickerEl.innerHTML = HEART_PICK.repeat(10);
  const hearts = [...pickerEl.children];
  let selected = 0;
  // The heart just clicked: while the pointer stays on it, it doesn't
  // offer to clear what it just set.
  let justPicked = 0;

  const label = (value) => (value > 0 ? `${value}/10` : t("Unrated"));

  const reduceMotion = () =>
    document.documentElement.dataset.reduceMotion === "true" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // `from`: the hearts past it pop in one after another (a rating going
  // up); without it, everything changes at once.
  function paint(value, from = null) {
    const stagger = from != null && !reduceMotion();
    hearts.forEach((heart, i) => {
      const fill = Math.min(1, Math.max(0, value - i));
      heart.classList.toggle("on", fill > 0);
      heart.classList.toggle("part", fill > 0 && fill < 1);
      heart.style.setProperty("--part", `${fill * 100}%`);
      heart.style.setProperty("--delay", stagger && i >= from ? `${(i - from) * HEART_POP_STEP_MS}ms` : "0ms");
    });
    valueEl.textContent = label(value);
    pickerEl.setAttribute("aria-valuenow", String(value));
    pickerEl.setAttribute("aria-valuetext", label(value));
  }

  function fromEvent(e) {
    const rect = pickerEl.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    // Heart N spans ((N-1)/10, N/10] of the row: ceil, not round, so
    // anywhere on heart N means N.
    return Math.min(10, Math.max(1, Math.ceil(ratio * 10)));
  }

  function preview(n) {
    const clearing = n === selected;
    hearts.forEach((heart, i) => heart.classList.toggle("preview", i < n));
    pickerEl.classList.add("is-previewing");
    pickerEl.classList.toggle("is-clearing", clearing);
    valueEl.classList.toggle("is-hint", clearing);
    valueEl.textContent = clearing ? t("Clear it") : label(n);
  }

  function endPreview() {
    hearts.forEach((heart) => heart.classList.remove("preview"));
    pickerEl.classList.remove("is-previewing", "is-clearing");
    valueEl.classList.remove("is-hint");
    valueEl.textContent = label(selected);
  }

  function pick(value) {
    const from = value > selected ? Math.floor(selected) : null;
    selected = value;
    endPreview();
    paint(selected, from);
  }

  pickerEl.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const n = fromEvent(e);
    if (n === justPicked) return;
    justPicked = 0;
    preview(n);
  });
  pickerEl.addEventListener("pointerleave", () => {
    justPicked = 0;
    endPreview();
  });
  pickerEl.addEventListener("click", (e) => {
    const n = fromEvent(e);
    const next = n === selected ? 0 : n;
    justPicked = next;
    pick(next);
  });
  pickerEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") pick(Math.min(10, Math.floor(selected) + 1));
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") pick(Math.max(0, Math.ceil(selected) - 1));
    else if (e.key === "Backspace" || e.key === "Delete") pick(0);
    else return;
    e.preventDefault();
  });

  return {
    get: () => selected,
    set: (value) => {
      selected = value;
      justPicked = 0;
      endPreview();
      paint(value);
    },
  };
}
