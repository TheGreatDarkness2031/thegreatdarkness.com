/* OER CONSOLE FRAME
   One frame for every OER screen: network banner (top + bottom), a title
   bar with the UTC clock and link light, and a menu rail on the left
   (a MENU button on phones). Pages include this file before nav.js.
   No less-than characters in this file (pages may inline it later). */
(function () {
  var MENU = [
    ["HOME", "/home/"],
    ["RADAR", "/radar/"],
    ["EVENTS", "/events/"],
    ["WATCH LOG", "/watch/"],
    ["MAINTENANCE", "/maintenance/"],
    ["PROFILE", "/profile/"],
    ["MONITORS", [
      ["SEISMIC", "/monitor/quake/"],
      ["TEMPERATURE", "/monitor/temp/"],
      ["POWER GRID", "/monitor/powergridreal/"],
      ["GRID HISTORY", "/monitor/powergrid/"],
      ["SPACE WX", "/monitor/spacewx/"],
      ["SEVERE WX", "/monitor/severewx/"],
      ["WILDFIRE", "/monitor/wildfire/"],
      ["VOLCANIC", "/monitor/volcano/"],
      ["NETWORK", "/monitor/netout/"],
      ["GPS / NAV", "/monitor/gps/"],
      ["AI INCIDENT", "/monitor/aiinc/"]
    ]],
    ["TOOLS", "/tools/"],
    ["WELLNESS", "/wellness/"],
    ["ARCADE", "/arcade/"]
  ];
  var BANNER = "OER // INTERNAL NETWORK // NODE GDK-001 // AUTHORIZED ACCESS ONLY";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function here(href) {
    var p = location.pathname;
    return p === href || (href !== "/home/" && p.indexOf(href) === 0);
  }

  function menuList() {
    var ul = el("ul", "oerc-menu");
    MENU.forEach(function (item) {
      var li = el("li");
      if (typeof item[1] === "string") {
        var a = el("a", "oerc-item" + (here(item[1]) ? " oerc-here" : ""), item[0]);
        a.href = item[1];
        li.appendChild(a);
      } else {
        var open = item[1].some(function (s) { return here(s[1]); });
        var d = el("details", "oerc-group");
        if (open) d.open = true;
        d.appendChild(el("summary", "oerc-item", item[0]));
        var sub = el("ul", "oerc-sub");
        item[1].forEach(function (s) {
          var sl = el("li");
          var a = el("a", "oerc-subitem" + (here(s[1]) ? " oerc-here" : ""), s[0]);
          a.href = s[1];
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
    var mini = el("img", "oerc-mini-seal");
    mini.src = "/assets/img/oer-seal-300.png";
    mini.alt = "";
    left.appendChild(menuBtn);
    left.appendChild(mini);
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
    var sealLink = el("a", "oerc-seal");
    sealLink.href = "/profile/";
    sealLink.title = "Operational Event Register";
    var seal = el("img");
    seal.src = "/assets/img/oer-seal-300.png";
    seal.alt = "Operational Event Register seal";
    sealLink.appendChild(seal);
    sealLink.appendChild(el("span", "", "OER"));
    rail.appendChild(sealLink);
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
