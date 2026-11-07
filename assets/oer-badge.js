/* OER seal in the upper-left corner of the OER screens.
   Sits in the corner when there is room; when the page's own content
   reaches the corner, it sits in a slim strip above the page instead. */
(function () {
  var css =
    ".oer-badge{position:absolute;top:10px;left:12px;z-index:40;display:flex;flex-direction:column;align-items:center;gap:3px;text-decoration:none;color:#d8d2c4;font-family:'Courier New',Courier,monospace;font-weight:bold;font-size:11px;letter-spacing:3px;}" +
    ".oer-badge img{width:62px;height:62px;display:block;border-radius:50%;filter:drop-shadow(0 0 6px rgba(255,255,255,0.14));}" +
    ".oer-badge span{padding-left:3px;text-shadow:0 0 6px rgba(0,0,0,0.9);}" +
    ".oer-badge:hover img,.oer-badge:focus img{filter:drop-shadow(0 0 8px rgba(255,255,255,0.35));}" +
    ".oer-badge.oer-strip{position:static;flex-direction:row;gap:8px;padding:6px 10px 4px;}" +
    ".oer-badge.oer-strip img{width:38px;height:38px;}" +
    ".oer-badge.oer-strip span{font-size:12px;}";

  function place() {
    if (document.querySelector(".oer-badge")) return;
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    var a = document.createElement("a");
    a.className = "oer-badge";
    a.href = "/profile/";
    a.title = "Operational Event Register";
    a.innerHTML = '<img src="/assets/img/oer-seal-300.png" alt="Operational Event Register seal"><span>OER</span>';
    document.body.insertBefore(a, document.body.firstChild);

    // Does anything visible on the page overlap the corner?
    var r = a.getBoundingClientRect();
    var pad = 6;
    var hit = [].some.call(document.body.querySelectorAll("*"), function (el) {
      if (el === a || a.contains(el)) return false;
      var cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.visibility === "hidden" || cs.display === "none") return false;
      if (el.children.length && el.textContent.trim() === "" && !/IMG|CANVAS|SVG|INPUT|BUTTON|SELECT/.test(el.tagName)) return false;
      var q = el.getBoundingClientRect();
      if (!q.width || !q.height) return false;
      // ignore page-wide wrappers that only provide background
      if (q.width >= innerWidth - 2 && el.children.length) return false;
      return q.left < r.right + pad && q.right > r.left && q.top < r.bottom + pad && q.bottom > r.top;
    });
    if (hit || innerWidth < 900) a.classList.add("oer-strip");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", place);
  } else {
    place();
  }
})();
