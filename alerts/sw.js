// OER ALERTS app service worker (thegreatdarkness.com/alerts/ only; owner
// 2026-11-15: a separate app people install, the main site stays a plain website).
//
// Its scope is /alerts/: it never touches any other page of the site.
// It caches ONE thing, the offline notice (/alerts/offline.html). Pages and
// live data always come from the network, so nothing old is shown as
// current. Push handling (stage 2) will be added to this file.
//
// Changing this file: raise VERSION so browsers drop the old cache.
const VERSION = "oer-alerts-1";
const OFFLINE_URL = "/alerts/offline.html";

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(VERSION)
      .then(function (cache) { return cache.addAll([OFFLINE_URL]); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf("oer-alerts-") === 0 && k !== VERSION; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  // Only page loads inside /alerts/. Scripts, images and live data pass through.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(OFFLINE_URL).then(function (page) {
        return page || new Response("NODE UNREACHABLE // RETRYING", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      });
    })
  );
});
