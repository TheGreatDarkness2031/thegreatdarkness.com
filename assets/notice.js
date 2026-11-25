/* Site notice (2026-11-11): the "not an official alert service" line on
   every page, with links to /sources/ and /privacy/. One wording, kept here.
   - Pages that scroll: a readable block at the bottom.
   - Screens built to fill the window (Radar, Terminal): a short line in the
     console frame's bottom bar instead, so they never start to scroll.
   Load with <script src="/assets/notice.js" defer></script>. */
(function () {
  var FULL = "INDEPENDENT CREATIVE PROJECT. NOT AN OFFICIAL ALERT OR EMERGENCY SERVICE. " +
    "DO NOT USE FOR SAFETY DECISIONS. FOR OFFICIAL ALERTS, CONTACT YOUR LOCAL AUTHORITIES " +
    "OR THE NATIONAL WEATHER SERVICE.";
  var FIT = ["/radar/", "/terminal/", "/schedule/", "/hr/", "/floor/", "/maintenance/", "/watch/", "/wiki/", "/support/"];

  function link(href, text) {
    var a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    return a;
  }

  function run() {
    if (document.getElementById("oerSiteNotice")) return;
    var path = location.pathname;

    if (FIT.indexOf(path) >= 0) {
      var bar = document.querySelector(".oerc-banner-bottom");
      if (!bar) return;
      var s = document.createElement("span");
      s.id = "oerSiteNotice";
      s.className = "oer-site-notice-short";
      s.appendChild(document.createTextNode("NOT AN OFFICIAL ALERT SERVICE "));
      s.appendChild(link("/sources/", "[ SOURCES ]"));
      var best = bar.querySelector(".oerc-hide-small");
      if (best) bar.replaceChild(s, best); else bar.appendChild(s);
      return;
    }

    var box = document.createElement("div");
    box.id = "oerSiteNotice";
    box.className = "oer-site-notice";
    box.setAttribute("role", "note");
    box.appendChild(document.createTextNode(FULL));
    var links = document.createElement("div");
    links.className = "oer-site-notice-links";
    links.appendChild(link("/sources/", "[ DATA SOURCES ]"));
    links.appendChild(document.createTextNode(" "));
    links.appendChild(link("/privacy/", "[ DATA HANDLING NOTICE ]"));
    box.appendChild(links);
    var bottom = document.querySelector(".oerc-banner-bottom");
    document.body.insertBefore(box, bottom || null);
    // The homepage's entry notice (2026-11-15) carries a copy under its window.
    var entry = document.getElementById("oerEntry");
    if (entry) {
      var copy = box.cloneNode(true);
      copy.removeAttribute("id");
      entry.appendChild(copy);
      box.setAttribute("inert", "");   // behind the notice; cleared at I ACCEPT
    }
  }

  var css = document.createElement("style");
  css.textContent =
    ".oer-site-notice{clear:both;max-width:760px;margin:18px auto 12px;padding:10px 14px;" +
    "background:#000;color:#c8c8c8;border:1px solid #555;font:12px/1.55 'Courier New',Courier,monospace;" +
    "letter-spacing:1px;text-align:center;box-sizing:border-box}" +
    ".oer-site-notice-links{margin-top:6px}" +
    ".oer-site-notice a,.oer-site-notice-short a{color:#00cc00;text-decoration:underline}" +
    ".oer-site-notice a:hover,.oer-site-notice a:focus,.oer-site-notice-short a:hover{color:#00ff00;text-decoration:underline}" +
    ".oer-site-notice-links a{margin:0 6px}" +
    // Accessibility (2026-11-23): keyboard focus is always visible, and a
    // device that asks for less motion gets it (blinks and sweeps stop).
    ":focus-visible{outline:2px solid #ffd24a!important;outline-offset:2px}" +
    // A part that shows focus its own way opts out (the NEXUS terminal glows green).
    ".oer-own-focus:focus-visible{outline:none!important}" +
    "@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;" +
    "animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}";
  (document.head || document.documentElement).appendChild(css);

  // Scrolling ticker (homepage <marquee>): pauses under the pointer or on
  // keyboard focus; with reduced motion it slides in once and stays.
  function calmMarquees() {
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    Array.prototype.forEach.call(document.getElementsByTagName("marquee"), function (m) {
      if (reduce) m.setAttribute("behavior", "slide");
      m.setAttribute("tabindex", "0");
      var stop = function () { if (m.stop) m.stop(); };
      var go = function () { if (m.start) m.start(); };
      m.addEventListener("mouseenter", stop);
      m.addEventListener("mouseleave", go);
      m.addEventListener("focus", stop);
      m.addEventListener("blur", go);
    });
  }

  // console.js builds the frame on DOMContentLoaded; run just after it.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(run, 0); calmMarquees(); });
  } else {
    setTimeout(run, 0);
    calmMarquees();
  }
})();
