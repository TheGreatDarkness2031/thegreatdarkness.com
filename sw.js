// Retired 2026-11-15. For about an hour the whole site was an installable
// app with this service worker; the owner chose a separate OER ALERTS app at
// /alerts/ instead (its worker is /alerts/sw.js). Browsers that picked up the
// old worker fetch this file again and it removes itself and its cache.
// Keep this file for a few months, then delete it.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf("oer-app-") === 0; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.registration.unregister(); })
  );
});
