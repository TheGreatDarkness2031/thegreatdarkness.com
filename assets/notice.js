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
  var FIT = ["/radar/", "/terminal/", "/schedule/"];

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
  }

  var css = document.createElement("style");
  css.textContent =
    ".oer-site-notice{clear:both;max-width:760px;margin:18px auto 12px;padding:10px 14px;" +
    "background:#000;color:#c8c8c8;border:1px solid #555;font:12px/1.55 'Courier New',Courier,monospace;" +
    "letter-spacing:1px;text-align:center;box-sizing:border-box}" +
    ".oer-site-notice-links{margin-top:6px}" +
    ".oer-site-notice a,.oer-site-notice-short a{color:#00cc00;text-decoration:none}" +
    ".oer-site-notice a:hover,.oer-site-notice a:focus,.oer-site-notice-short a:hover{color:#00ff00;text-decoration:underline}" +
    ".oer-site-notice-links a{margin:0 6px}";
  (document.head || document.documentElement).appendChild(css);

  // console.js builds the frame on DOMContentLoaded; run just after it.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(run, 0); });
  } else {
    setTimeout(run, 0);
  }
})();
