function createStarsInput(starsEl, fillEl, valueEl) {
  let selected = 0;

  function paint(value) {
    fillEl.style.width = `${value * 10}%`;
    valueEl.textContent = `${value}/10`;
  }

  function fromEvent(e) {
    const rect = starsEl.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    // Star N visually spans ((N-1)/10, N/10] of the row — ceil (not round)
    // is what maps "anywhere on star N" to N. round() instead centers each
    // value on the boundary *between* stars, so the hit zone for N sits half
    // a star to the right of star N itself: hovering the star shows N-1,
    // and you have to reach into the empty space after it to see N.
    return Math.min(10, Math.max(1, Math.ceil(ratio * 10)));
  }

  starsEl.addEventListener("mousemove", (e) => paint(fromEvent(e)));
  starsEl.addEventListener("mouseleave", () => paint(selected));
  starsEl.addEventListener("click", (e) => {
    selected = fromEvent(e);
    paint(selected);
  });

  return {
    get: () => selected,
    set: (value) => {
      selected = value;
      paint(value);
    },
  };
}
