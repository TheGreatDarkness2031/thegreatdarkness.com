// OER app service worker (installable app, stage 1 of the alerts plan, 2026-11-15).
//
// Deliberately small. It caches ONE thing: the offline notice (/offline.html).
// Every page and every live data request goes to the network as usual, so
// nothing old is ever shown as if it were current. When a page can't be
// loaded at all (no connection), the offline notice is shown in its place;
// it retries by itself and reloads the page when the connection is back.
//
// Changing this file: raise VERSION so browsers drop the old cache.
const VERSION = "oer-app-1";
const OFFLINE_URL = "/offline.html";

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
        return Promise.all(keys.filter(function (k) { return k !== VERSION; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  // Only page loads. Scripts, images and the live data calls (Apps Script,
  // another address) pass straight through, untouched.
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
