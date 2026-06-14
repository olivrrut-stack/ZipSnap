// A simple content script. It injects a small floating badge onto whatever page
// the user is viewing. Phase 1 will screenshot this overlay on a demo page;
// for Phase 0 it just needs to exist so the manifest reader detects it.
(function () {
  if (document.getElementById("zipsnap-test-badge")) return;
  const badge = document.createElement("div");
  badge.id = "zipsnap-test-badge";
  badge.textContent = "✦ ZipSnap Test active";
  Object.assign(badge.style, {
    position: "fixed",
    bottom: "16px",
    right: "16px",
    zIndex: "2147483647",
    padding: "10px 14px",
    background: "#6d5efc",
    color: "#fff",
    font: "600 13px -apple-system, 'Segoe UI', system-ui, sans-serif",
    borderRadius: "10px",
    boxShadow: "0 6px 20px rgba(109,94,252,0.4)",
  });
  document.documentElement.appendChild(badge);
})();
