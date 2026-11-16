// OER ALERTS link on the 11 monitor pages (owner 2026-11-16): adds
// [ RECEIVE ALERTS ] at the bottom of the page's status box. It opens the
// OER ALERTS app with this monitor already ticked (/alerts/?ch=<prefix>).
// One file, so the wording and look change in one place.
(function () {
  var m = location.pathname.match(/^\/monitor\/([a-z_]+)\/?/);
  if (!m) return;
  var prefix = m[1] === "powergridreal" ? "powergrid_real" : m[1];
  function add() {
    var panel = document.querySelector(".status-panel");
    if (!panel || panel.querySelector(".oer-alerts-link")) return;
    var div = document.createElement("div");
    div.className = "oer-alerts-link";
    // A real button (owner 2026-11-16: the small text link was too easy to miss).
    // Amber like the homepage's OER ALERTS box (owner 2026-11-16: one look throughout).
    div.style.cssText = "margin-top:14px;text-align:center;";
    var a = document.createElement("a");
    a.href = "/alerts/?ch=" + encodeURIComponent(prefix);
    a.textContent = "> GET ALERTS FROM THIS MONITOR ON YOUR PHONE OR COMPUTER";
    a.style.cssText = "display:inline-block;max-width:100%;box-sizing:border-box;padding:10px 18px;border:2px solid #cc8a00;" +
      "background:#0d0900;color:#ffbf33;font:bold 14px/1.3 'Courier New',Courier,monospace;letter-spacing:1px;text-decoration:none;" +
      "box-shadow:inset 0 0 18px rgba(255,191,51,0.12);text-shadow:0 0 4px rgba(255,191,51,0.25);";
    a.onmouseover = a.onfocus = function () { a.style.background = "#1a1200"; a.style.borderColor = "#ffbf33"; };
    a.onmouseout = a.onblur = function () { a.style.background = "#0d0900"; a.style.borderColor = "#cc8a00"; };
    a.title = "Get this monitor's status changes on your phone or computer";
    div.appendChild(a);
    panel.appendChild(div);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
  else add();
})();
