/* OER CONSOLE FRAME
   One frame for every OER screen: network banner (top + bottom), a title
   bar with the UTC clock and link light, and a menu rail on the left
   (a MENU button on phones). Pages include this file before nav.js.
   A page that sets window.OER_NO_FRAME = true first (the homepage) gets
   the 1998 touches below without the frame.

   1998 touches: a connecting screen on the first page of a session,
   footer badges with a last-modified line, NEW! tags in the rail, a
   Windows-style dialog when the data service fails, and an applet
   loading box while a page's first data arrives (gsr.js reports calls).
   No less-than characters in this file (pages may inline it later). */
(function () {
  // [label, address, "NEW!" shown until this date (optional)], or
  // [label, [items]] for a group: closed unless the page is inside it,
  // NEW! on the group while any item in it is new (2026-11-08).
  var MENU = [
    ["HOME", "/home/"],
    ["RADAR", "/radar/"],
    ["MONITORS", [
      ["SEISMIC", "/monitor/quake/"],
      ["TEMPERATURE", "/monitor/temp/"],
      ["POWER GRID", "/monitor/powergridreal/"],
      ["SPACE WX", "/monitor/spacewx/"],
      ["SEVERE WX", "/monitor/severewx/"],
      ["WILDFIRE", "/monitor/wildfire/"],
      ["VOLCANIC", "/monitor/volcano/"],
      ["NETWORK", "/monitor/netout/"],
      ["GPS / NAV", "/monitor/gps/"],
      ["AI INCIDENT", "/monitor/aiinc/"],
      ["NEAR-EARTH", "/monitor/neo/", "2026-12-08"]
    ]],
    ["LOGS", [
      ["EVENT LOG", "/events/"],
      ["WATCH LOG", "/watch/"],
      ["MAINTENANCE LOG", "/maintenance/"],
      ["RSS CHANNEL", "/feed/", "2026-12-08"]
    ]],
    ["RESOURCES", [
      ["TOOLS", "/tools/"],
      ["WELLNESS", "/wellness/"],
      ["PERSONNEL", "/hr/", "2026-12-09"]
    ]],
    ["PROFILE", "/profile/"],
    ["TERMINAL", "/terminal/", "2026-12-08"],
    ["ARCADE", "/arcade/"]
  ];
  var BANNER = "OER // INTERNAL NETWORK // NODE GDK-001 // AUTHORIZED ACCESS ONLY";
  // Screens sized to fit the window exactly: no footer below them.
  var NO_FOOTER = ["/radar/", "/terminal/"];
  var framed = !window.OER_NO_FRAME;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function here(href) {
    var p = location.pathname;
    // Wellness documents open in the shared viewer: light WELLNESS, not TOOLS.
    if (p.indexOf("/tools/document/") === 0 && /[?&]doc=WL_/i.test(location.search)) {
      return href === "/wellness/";
    }
    return p === href || (href !== "/home/" && p.indexOf(href) === 0);
  }

  function isNew(until) {
    return !!until && Date.parse(until + "T00:00:00Z") > Date.now();
  }

  function menuList() {
    var ul = el("ul", "oerc-menu");
    MENU.forEach(function (item) {
      var li = el("li");
      if (typeof item[1] === "string") {
        var a = el("a", "oerc-item" + (here(item[1]) ? " oerc-here" : ""), item[0]);
        a.href = item[1];
        if (isNew(item[2])) a.appendChild(el("span", "oerc-new", "NEW!"));
        li.appendChild(a);
      } else {
        var open = item[1].some(function (s) { return here(s[1]); });
        var d = el("details", "oerc-group");
        if (open) d.open = true;
        var summary = el("summary", "oerc-item", item[0]);
        if (item[1].some(function (s) { return isNew(s[2]); })) summary.appendChild(el("span", "oerc-new", "NEW!"));
        d.appendChild(summary);
        var sub = el("ul", "oerc-sub");
        item[1].forEach(function (s) {
          var sl = el("li");
          var a = el("a", "oerc-subitem" + (here(s[1]) ? " oerc-here" : ""), s[0]);
          a.href = s[1];
          if (isNew(s[2])) a.appendChild(el("span", "oerc-new", "NEW!"));
          sl.appendChild(a);
          sub.appendChild(sl);
        });
        d.appendChild(sub);
        li.appendChild(d);
      }
      ul.appendChild(li);
    });
    return ul;
  }

  function pageName() {
    var t = document.title || "";
    var parts = t.split("//");
    return (parts.length > 1 ? parts[parts.length - 1] : t.replace(/^The Great Darkness\s*-\s*/i, "")).trim().toUpperCase();
  }

  function pad(n) { return (n > 9 ? "" : "0") + n; }
  var DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  function build() {
    if (document.body.classList.contains("oerc")) return;
    document.body.classList.add("oerc");
    var started = Date.now();

    var top = el("div", "oerc-banner oerc-banner-top", BANNER);
    var bottom = el("div", "oerc-banner oerc-banner-bottom");
    var session = el("span", "oerc-session");
    bottom.appendChild(el("span", "", "OER PUBLIC NETWORK ACCESS NODE"));
    bottom.appendChild(session);
    bottom.appendChild(el("span", "oerc-hide-small", "BEST VIEWED AT 800 X 600"));

    var bar = el("div", "oerc-bar");
    var left = el("div", "oerc-bar-left");
    var menuBtn = el("button", "oerc-menu-button", "MENU");
    menuBtn.type = "button";
    menuBtn.setAttribute("aria-expanded", "false");
    left.appendChild(menuBtn);
    left.appendChild(el("span", "oerc-org", "OPERATIONAL EVENT REGISTER"));
    var mid = el("div", "oerc-bar-mid", pageName());
    var right = el("div", "oerc-bar-right");
    var clock = el("span", "oerc-clock");
    var light = el("span", "oerc-light", "LINK");
    right.appendChild(clock);
    right.appendChild(light);
    bar.appendChild(left);
    bar.appendChild(mid);
    bar.appendChild(right);

    var rail = el("nav", "oerc-rail");
    rail.setAttribute("aria-label", "OER network");
    rail.appendChild(el("div", "oerc-rail-title", "DIRECTORY"));
    rail.appendChild(menuList());
    rail.appendChild(el("div", "oerc-rail-foot", "TERMINAL GDK-001"));

    menuBtn.addEventListener("click", function () {
      var open = document.body.classList.toggle("oerc-menu-open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      menuBtn.textContent = open ? "CLOSE" : "MENU";
    });

    var b = document.body;
    b.insertBefore(rail, b.firstChild);
    b.insertBefore(bar, b.firstChild);
    b.insertBefore(top, b.firstChild);
    b.appendChild(bottom);

    function tick() {
      var d = new Date();
      clock.textContent =
        DAYS[d.getUTCDay()] + " " + pad(d.getUTCDate()) + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear() +
        " // " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) + " UTC";
      var s = Math.floor((Date.now() - started) / 1000);
      session.textContent = "SESSION " + pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
      light.classList.toggle("oerc-light-on", navigator.onLine !== false);
      light.classList.toggle("oerc-light-off", navigator.onLine === false);
    }
    tick();
    setInterval(tick, 1000);
  }

  // ---- footer: 88x31 badges and the page's last-modified time ----
  function badge(cls, key, text, href) {
    var b = el(href ? "a" : "span", "oer-badge88 " + cls);
    if (href) b.href = href;
    b.appendChild(el("span", "k", key));
    b.appendChild(el("span", "t", text));
    return b;
  }

  function footer() {
    if (NO_FOOTER.some(function (p) { return location.pathname === p; })) return;
    var f = el("div", "oer-retro-foot");
    var row = el("div", "oer-badges");
    row.appendChild(badge("y2k", "Y2K", "COMPLIANT"));
    row.appendChild(badge("res", "800 600", "BEST VIEWED"));
    row.appendChild(badge("pad", "✎", "MADE WITH NOTEPAD"));
    row.appendChild(badge("net", "OER", "NET MEMBER"));
    row.appendChild(badge("xml", "XML", "RSS CHANNEL", "/feed/"));
    f.appendChild(row);
    var m = new Date(document.lastModified);
    if (!isNaN(m.getTime())) {
      f.appendChild(el("div", "",
        "PAGE LAST MODIFIED: " + pad(m.getUTCMonth() + 1) + "/" + pad(m.getUTCDate()) + "/" + m.getUTCFullYear() +
        " " + pad(m.getUTCHours()) + ":" + pad(m.getUTCMinutes()) + " UTC // NODE GDK-001"));
    }
    var bottomBanner = document.querySelector(".oerc-banner-bottom");
    document.body.insertBefore(f, bottomBanner || null);

    // Shown only on pages that already scroll: on a screen that fits the
    // window, the footer would otherwise add a small, pointless scroll.
    function place() {
      f.style.display = "none";
      var tall = document.documentElement.scrollHeight > window.innerHeight + 1;
      f.style.display = tall ? "" : "none";
    }
    place();
    window.addEventListener("load", place);
    window.addEventListener("resize", place);
    if (window.ResizeObserver) {
      var last = 0;
      new ResizeObserver(function () {
        var h = document.body.scrollHeight;
        if (Math.abs(h - last) > 2) { last = h; place(); }
      }).observe(document.body);
    }
  }

  // ---- connecting screen: first OER page of a browser session ----
  var CONNECT_KEY = "oerSessionOpen";
  var connecting = false;
  try { connecting = !sessionStorage.getItem(CONNECT_KEY); } catch (e) { connecting = false; }
  if (connecting) {
    document.documentElement.classList.add("oer-connecting");
    try { sessionStorage.setItem(CONNECT_KEY, "1"); } catch (e) {}
  }

  function connectScreen() {
    if (!connecting) return;
    var LINES = [
      "OER PUBLIC NETWORK ACCESS NODE",
      "",
      "ATZ",
      "OK",
      "ATDT *** *** ****",
      "DIALING NODE GDK-001...",
      "CONNECT 28800/ARQ/V34/LAPM/V42BIS",
      "NEGOTIATING SESSION... GUEST",
      "SESSION OPEN."
    ];
    var shade = el("div", "oer-connect");
    var box = el("div", "oer-connect-box");
    var skip = el("div", "oer-connect-skip", "[ CLICK OR PRESS ANY KEY TO SKIP ]");
    shade.appendChild(box);
    box.appendChild(skip);
    document.body.appendChild(shade);
    var i = 0, timer = null, done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      document.documentElement.classList.remove("oer-connecting");
      if (shade.parentNode) shade.parentNode.removeChild(shade);
      document.removeEventListener("keydown", finish);
    }
    function next() {
      if (i === LINES.length) { timer = setTimeout(finish, 350); return; }
      box.insertBefore(document.createTextNode(LINES[i++] + "\n"), skip);
      timer = setTimeout(next, i === 6 ? 520 : 170);
    }
    shade.addEventListener("click", finish);
    document.addEventListener("keydown", finish);
    next();
  }

  // ---- Windows-style dialog (window.oerDialog) ----
  var dialogOpen = false;
  function oerDialog(title, text) {
    if (dialogOpen) return;
    dialogOpen = true;
    var shade = el("div", "oer-dialog-shade");
    var d = el("div", "oer-dialog");
    d.setAttribute("role", "alertdialog");
    var t = el("div", "oer-dialog-title");
    t.appendChild(el("span", "", title));
    var x = el("button", "oer-dialog-x", "x");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    t.appendChild(x);
    var body = el("div", "oer-dialog-body");
    body.appendChild(el("div", "oer-dialog-icon", "X"));
    body.appendChild(el("div", "oer-dialog-text", text));
    var buttons = el("div", "oer-dialog-buttons");
    var ok = el("button", "oer-dialog-ok", "OK");
    ok.type = "button";
    buttons.appendChild(ok);
    d.appendChild(t);
    d.appendChild(body);
    d.appendChild(buttons);
    shade.appendChild(d);
    document.body.appendChild(shade);
    function close() {
      if (shade.parentNode) shade.parentNode.removeChild(shade);
      dialogOpen = false;
    }
    ok.addEventListener("click", close);
    x.addEventListener("click", close);
    ok.focus();
  }
  window.oerDialog = oerDialog;

  // ---- data calls (reported by gsr.js): applet box and failure dialog ----
  var pending = 0, firstLoadOver = false, appletTimer = null, applet = null, failedOnce = false;
  function showApplet() {
    if (applet || firstLoadOver) return;
    applet = el("div", "oer-applet");
    applet.appendChild(el("div", "", "LOADING OER CONSOLE APPLET..."));
    var bar = el("div", "oer-applet-bar");
    bar.appendChild(el("div", "oer-applet-fill"));
    applet.appendChild(bar);
    document.body.appendChild(applet);
  }
  window.oerRpcStart = function () {
    pending++;
    if (!firstLoadOver && !appletTimer) appletTimer = setTimeout(showApplet, 700);
  };
  window.oerRpcEnd = function (ok) {
    pending = Math.max(0, pending - 1);
    if (!ok && !failedOnce) {
      failedOnce = true;
      oerDialog("OER CONSOLE",
        "The OER data service did not respond.\n\nSome information on this screen may be missing or out of date.");
    }
    if (pending === 0 && !firstLoadOver) {
      firstLoadOver = true;
      clearTimeout(appletTimer);
      if (applet && applet.parentNode) applet.parentNode.removeChild(applet);
    }
  };

  // ---- OER seal watermark: record and document screens only ----
  // (not Profile: it already shows the seal itself)
  var SEAL_PAGES = ["/tools/", "/watch/", "/maintenance/"];
  function sealMark() {
    if (!framed) return;
    var p = location.pathname;
    if (!SEAL_PAGES.some(function (s) { return p.indexOf(s) === 0; })) return;
    var m = el("div", "oer-seal-mark");
    m.setAttribute("aria-hidden", "true");
    document.body.appendChild(m);
  }

  // ---- DAY / NIGHT switch: a page puts
  //   <span data-oer-daynight="watch" data-default="night"></span>
  // where the switch goes, and styles body.oer-day / body.oer-night.
  // The choice is remembered per page (localStorage). ----
  function dayNight() {
    var spot = document.querySelector("[data-oer-daynight]");
    if (!spot) return;
    var key = "oerDisplay_" + spot.getAttribute("data-oer-daynight");
    var mode = spot.getAttribute("data-default") === "day" ? "day" : "night";
    try { var saved = localStorage.getItem(key); if (saved === "day" || saved === "night") mode = saved; } catch (e) {}
    spot.className = "oer-daynight";
    spot.setAttribute("role", "group");
    spot.setAttribute("aria-label", "Display");
    spot.appendChild(el("span", "oer-daynight-label", "DISPLAY:"));
    var buttons = {};
    ["day", "night"].forEach(function (m) {
      var b = el("button", "", m.toUpperCase());
      b.type = "button";
      b.addEventListener("click", function () { set(m, true); });
      buttons[m] = b;
      spot.appendChild(b);
    });
    function set(m, save) {
      mode = m;
      document.body.classList.toggle("oer-day", m === "day");
      document.body.classList.toggle("oer-night", m === "night");
      buttons.day.setAttribute("aria-pressed", m === "day" ? "true" : "false");
      buttons.night.setAttribute("aria-pressed", m === "night" ? "true" : "false");
      if (save) { try { localStorage.setItem(key, m); } catch (e) {} }
    }
    set(mode, false);
  }

  function start() {
    if (framed) build();
    dayNight();
    sealMark();
    footer();
    connectScreen();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
