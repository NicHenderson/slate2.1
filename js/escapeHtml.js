// Escapes text before it's interpolated into an innerHTML template literal —
// titles/names/synopses come from the user or from TMDB's public, editable
// database, so without this a crafted title could inject markup or run script
// in place of just being displayed as text.
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        ch
      ])
  );
}
