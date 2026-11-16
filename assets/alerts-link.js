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
    div.style.cssText = "margin-top:10px;font-size:12px;letter-spacing:1px;text-align:center;";
    var a = document.createElement("a");
    a.href = "/alerts/?ch=" + encodeURIComponent(prefix);
    a.textContent = "[ RECEIVE ALERTS ]";
    a.style.cssText = "color:#33ff66;text-decoration:none;";
    a.title = "Get this monitor's status changes on your phone or computer";
    div.appendChild(a);
    panel.appendChild(div);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
  else add();
})();
