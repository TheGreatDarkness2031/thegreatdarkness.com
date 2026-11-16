// OER ALERTS app service worker (thegreatdarkness.com/alerts/ only; owner
// 2026-11-15: a separate app people install, the main site stays a plain website).
//
// Its scope is /alerts/: it never touches any other page of the site.
// It caches ONE thing, the offline notice (/alerts/offline.html). Pages and
// live data always come from the network, so nothing old is shown as
// current. It also shows pushed alerts, keeps the last 200 on this device
// (IndexedDB "oer-alerts" / "traffic", read by MESSAGE TRAFFIC) and opens the
// matching page on tap.
//
// Changing this file: raise VERSION so browsers drop the old cache.
const VERSION = "oer-alerts-6";
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

// ---- Push alerts (stage 2) ----
var TRAFFIC_KEEP = 200;
function saveTraffic(rec) {
  return new Promise(function (resolve) {
    var rq;
    try { rq = indexedDB.open("oer-alerts", 1); } catch (e) { resolve(); return; }
    rq.onupgradeneeded = function () { rq.result.createObjectStore("traffic", { keyPath: "k", autoIncrement: true }); };
    rq.onerror = function () { resolve(); };
    rq.onsuccess = function () {
      var db = rq.result;
      var tx = db.transaction("traffic", "readwrite");
      var st = tx.objectStore("traffic");
      st.add(rec);
      var keys = st.getAllKeys();
      keys.onsuccess = function () {
        var k = keys.result || [];
        for (var i = 0; i < k.length - TRAFFIC_KEEP; i++) st.delete(k[i]);
      };
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { resolve(); };
    };
  });
}
// Icon badge (owner 2026-11-16): the number of messages not yet seen in
// MESSAGE TRAFFIC. Each saved record carries unread: 1 until the list is
// looked at (the page clears it). iPhones show only a number, so always a count.
function setBadgeFromTraffic() {
  if (!(self.navigator && self.navigator.setAppBadge)) return Promise.resolve();
  return new Promise(function (resolve) {
    var rq;
    try { rq = indexedDB.open("oer-alerts", 1); } catch (e) { resolve(0); return; }
    rq.onupgradeneeded = function () { rq.result.createObjectStore("traffic", { keyPath: "k", autoIncrement: true }); };
    rq.onerror = function () { resolve(0); };
    rq.onsuccess = function () {
      var all = rq.result.transaction("traffic", "readonly").objectStore("traffic").getAll();
      all.onsuccess = function () { resolve((all.result || []).filter(function (r) { return r.unread; }).length); };
      all.onerror = function () { resolve(0); };
    };
  }).then(function (n) {
    return (n > 0 ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(function () {});
  });
}
function tellPages() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (wins) {
    wins.forEach(function (w) { w.postMessage({ type: "oer-traffic" }); });
  });
}

self.addEventListener("push", function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : "" }; }
  var title = d.title || "OER // MESSAGE TRAFFIC";
  var options = {
    body: d.body || "New traffic received.",
    icon: "/icon-192.png",
    tag: d.tag || "oer-alert",
    renotify: true,
    vibrate: [200, 100, 200],
    requireInteraction: String(d.level || "") === "CRITICAL" || String(d.level || "") === "URGENT",
    data: { url: d.url || "/alerts/", ref: d.ref || "", at: d.at || Date.now() }
  };
  var rec = { title: title, body: options.body, url: options.data.url, level: String(d.level || ""),
    prefix: String(d.prefix || ""), ref: options.data.ref, at: options.data.at, unread: 1 };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    saveTraffic(rec).then(setBadgeFromTraffic).then(tellPages).catch(function () {})
  ]));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/alerts/";
  if (url.charAt(0) !== "/") url = "/alerts/";
  var target = new URL(url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (wins) {
      for (var i = 0; i < wins.length; i++) {
        if (wins[i].url === target && "focus" in wins[i]) return wins[i].focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
