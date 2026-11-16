// Installable app (alerts plan stage 1, 2026-11-15): registers /sw.js for the
// whole site. Added to every page by webtools\site_meta.js (OER-META block).
// The service worker only shows an offline notice when a page can't load.
(function () {
  try {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {});
    });
  } catch (e) {}
})();
