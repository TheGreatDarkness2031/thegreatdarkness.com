// The Apps Script web app: data feeds, scores, guestbook.
// Every page on thegreatdarkness.com reads its data from here.
var TGD_API_URL =
  "https://script.google.com/macros/s/AKfycbxXsPZtr6ZIqLcBIJeiLeoYSoOQQjKX2zDHsmd0Qn0dalEjgtD6hldIWEkQQFGx0K0GFg/exec";

// Monitor pages: /monitor/<name>/ (Config tile routes look like "?quake=1").
var TGD_MONITOR_PAGES = ["quake", "temp", "powergridreal",
  "spacewx", "severewx", "wildfire", "volcano", "netout", "gps", "aiinc", "neo"];

var TGD_ARCADE_GAMES = ["alienrun", "alieninvaders", "breakout", "snake",
  "dodge", "pong", "meteorminer", "sectorsweep"];

// Turns an old Apps Script page address ("?games=1", "?pdf=1&doc=X",
// "https://script.google.com/.../exec?quake=1") into this site's page.
// Anything it doesn't know stays on Apps Script.
function tgdPage(route) {
  route = String(route || "");
  var q = route.indexOf("?") >= 0 ? route.slice(route.indexOf("?") + 1) : "";
  var p = {};
  q.split("&").forEach(function(pair) {
    if (!pair) return;
    var i = pair.indexOf("=");
    var k = decodeURIComponent(i >= 0 ? pair.slice(0, i) : pair);
    p[k] = i >= 0 ? decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " ")) : "";
  });
  if (p.page === "radar") return "/radar/";
  if (p.page === "home" || p.homescreen === "1") return "/home/";
  if (p.pdf) return "/tools/document/" + (p.doc ? "?doc=" + encodeURIComponent(p.doc) : "");
  if (p.game && TGD_ARCADE_GAMES.indexOf(p.game) >= 0) return "/arcade/" + p.game + "/";
  var flags = { games: "/arcade/", hof: "/arcade/halloffame/", events: "/events/",
    maintenance: "/maintenance/", watch: "/watch/", oerprofile: "/profile/",
    tools: "/tools/", wellness: "/wellness/", share: "/share/" };
  for (var k in flags) if (p[k] === "1") return flags[k];
  // Grid History (?powergrid=1) was removed 2026-11-08: old links open the power grid monitor.
  if (p.powergrid === "1") return "/monitor/powergridreal/";
  for (var i = 0; i !== TGD_MONITOR_PAGES.length; i++) {
    if (p[TGD_MONITOR_PAGES[i]] === "1") return "/monitor/" + TGD_MONITOR_PAGES[i] + "/";
  }
  return route.charAt(0) === "?" ? TGD_API_URL + route : route;
}
