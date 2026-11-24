/* Cross-links (2026-11-23): one helper so every records page links the same
   things the same way.
     ENG-yy-nn       engineering project  -> /maintenance/?view=projects&p=
     FLR-001 ...     register document    -> /maintenance/?view=register&doc=
     OER-2004-002    employee number      -> /hr/?id=
     NX-1001         NEXUS employee no.   -> /hr/?id=
     full name       person on file       -> /hr/?id=   (full names only;
                     a name two people share is never linked)
     ML-005118       maintenance entry    -> /maintenance/?view=records&rec=
     199800001       watch log record     -> /watch/?rec=
     TT-2014-0031    trouble ticket       -> /support/?t=
   Codes are linked only when they exist in the published lists
   (/maintenance/projects.json, /maintenance/register.json, /hr/data.js,
   /support/data/index.json).
   A page marks the parts to link with data-xref; data-xref-skip="doc eng"
   leaves out kinds that would only point back at the same list. Links keep
   the page's own text colour, underlined. Nothing outside the site is read. */
(function () {
  var KINDS = ["eng", "doc", "emp", "name", "ml", "watch", "tt"];
  var SKIP_TAGS = { A: 1, BUTTON: 1, SELECT: 1, OPTION: 1, INPUT: 1, TEXTAREA: 1, SCRIPT: 1, STYLE: 1, LABEL: 1 };
  var data = null, loading = null;

  function getText(url) {
    return fetch(url, { cache: "default" }).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; });
  }

  function load() {
    if (loading) return loading;
    loading = Promise.all([getText("/maintenance/projects.json"), getText("/maintenance/register.json"), getText("/hr/data.js"), getText("/support/data/index.json")])
      .then(function (t) {
        var d = { eng: {}, doc: {}, emp: {}, name: {}, tt: {} };
        try { (JSON.parse(t[0]).projects || []).forEach(function (p) { d.eng[p.code] = 1; }); } catch (e) {}
        try { (JSON.parse(t[1]).documents || []).forEach(function (x) { d.doc[x.no] = 1; }); } catch (e) {}
        try {
          var hr = JSON.parse(t[2].replace(/^[\s\S]*?window\.HR\s*=\s*/, "").replace(/;\s*$/, ""));
          var count = {};
          (hr.people || []).forEach(function (p) {
            d.emp[p.id] = p.id;
            count[p.name] = (count[p.name] || 0) + 1;
          });
          (hr.people || []).forEach(function (p) { if (count[p.name] === 1 && /\s/.test(p.name)) d.name[p.name] = p.id; });
        } catch (e) {}
        try { (JSON.parse(t[3]).years || []).forEach(function (y) { d.tt[y.year] = Number(y.last.slice(-4)); }); } catch (e) {}
        // Never the Site C / D documents (terminal only).
        ["NET-003", "NET-004", "PWR-003", "PWR-004"].forEach(function (k) { delete d.doc[k]; });
        var names = Object.keys(d.name).sort(function (a, b) { return b.length - a.length; })
          .map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
        var parts = [
          "(ENG-\\d\\d-\\d\\d)",
          "([A-Z]{2,4}(?:-[A-Z]{1,4})?-\\d{2,3})",
          "(OER-(?:19|20)\\d\\d-\\d{3}|NX-10\\d\\d)",
          names.length ? "(" + names.join("|") + ")" : "(?!)",
          "(ML-\\d{6})",
          "((?:199[89]|20[0-2]\\d)\\d{5})",
          "(TT-20[0-2]\\d-\\d{4})"
        ];
        d.re = new RegExp("(?<![\\w-])(?:" + parts.join("|") + ")(?![\\w-])", "g");
        data = d;
        return d;
      });
    return loading;
  }

  // Which link a match makes, or null.
  function target(m) {
    if (m[1] && data.eng[m[1]]) return { kind: "eng", href: "/maintenance/?view=projects&p=" + m[1] };
    if (m[2] && data.doc[m[2]]) return { kind: "doc", href: "/maintenance/?view=register&doc=" + m[2] };
    if (m[3] && data.emp[m[3]]) return { kind: "emp", href: "/hr/?id=" + encodeURIComponent(m[3]) };
    if (m[4] && data.name[m[4]]) return { kind: "name", href: "/hr/?id=" + encodeURIComponent(data.name[m[4]]) };
    if (m[5]) return { kind: "ml", href: "/maintenance/?view=records&rec=" + Number(m[5].slice(3)) };
    if (m[6]) return { kind: "watch", href: "/watch/?rec=" + m[6] };
    if (m[7]) {
      var n = Number(m[7].slice(8)), top = data.tt[m[7].slice(3, 7)];
      return top && n >= 1 && n <= top ? { kind: "tt", href: "/support/?t=" + m[7] } : null;
    }
    return null;
  }

  // A link to the page being read (every part of the link's address is
  // already in this page's address) is left out: Brooks's file never links
  // to Brooks's file.
  function here(href) {
    var u = new URL(href, location.href);
    if (u.pathname !== location.pathname) return false;
    var now = new URLSearchParams(location.search), same = true;
    u.searchParams.forEach(function (v, k) { if (now.get(k) !== v) same = false; });
    return same;
  }

  // Inside a link or control, a data-noxref part, or a part the nearest
  // [data-xref] lists in data-xref-ignore (CSS selectors, e.g. the /hr/
  // directory table, whose rows already open the files).
  function skipped(node) {
    var ignore = null;
    for (var n = node.parentNode; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP_TAGS[n.tagName] || n.hasAttribute("data-noxref") || n.isContentEditable) return true;
      if (ignore === null && n.hasAttribute("data-xref")) {
        ignore = n.getAttribute("data-xref-ignore") || "";
        if (ignore) {
          try { if (node.parentNode.closest(ignore)) return true; } catch (e) {}
        }
        break;
      }
    }
    return false;
  }

  function skipKinds(node) {
    var out = {};
    for (var n = node.nodeType === 1 ? node : node.parentNode; n && n.nodeType === 1; n = n.parentNode) {
      var s = n.getAttribute("data-xref-skip");
      if (s) s.split(/[\s,]+/).forEach(function (k) { out[k] = 1; });
    }
    return out;
  }

  // The links in one piece of text: [{ at, word, kind, href }]. skip = kinds
  // to leave out ({ doc: 1 }). Also what the terminal and the tests use.
  function find(text, skip) {
    var out = [], m;
    if (!data) return out;
    skip = skip || {};
    data.re.lastIndex = 0;
    while ((m = data.re.exec(text))) {
      var to = target(m);
      if (!to || skip[to.kind] || (typeof location !== "undefined" && here(to.href))) continue;
      out.push({ at: m.index, word: m[0], kind: to.kind, href: to.href });
    }
    return out;
  }

  // Links every match in the text under root. Safe to call again.
  function scan(root) {
    if (!data || !root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], t;
    while ((t = walker.nextNode())) {
      if (t.nodeValue && /[A-Z0-9]/.test(t.nodeValue) && !skipped(t)) nodes.push(t);
    }
    nodes.forEach(function (node) {
      var text = node.nodeValue, last = 0;
      var hits = find(text, skipKinds(node));
      if (!hits.length) return;
      var frag = document.createDocumentFragment();
      hits.forEach(function (h) {
        if (h.at > last) frag.appendChild(document.createTextNode(text.slice(last, h.at)));
        var a = document.createElement("a");
        a.className = "oer-xref";
        a.href = h.href;
        a.textContent = h.word;
        frag.appendChild(a);
        last = h.at + h.word.length;
      });
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  // Watches every [data-xref] part and links what the page draws into it.
  function start() {
    var roots = document.querySelectorAll("[data-xref]");
    if (!roots.length) return;
    load().then(function () {
      var pending = [], queued = false;
      function flush() {
        queued = false;
        var list = pending; pending = [];
        list.forEach(scan);
      }
      Array.prototype.forEach.call(roots, function (root) {
        scan(root);
        new MutationObserver(function (records) {
          records.forEach(function (r) {
            Array.prototype.forEach.call(r.addedNodes, function (n) {
              if (n.nodeType === 1 && n.classList && n.classList.contains("oer-xref")) return;
              if (n.nodeType === 1 || n.nodeType === 3) pending.push(n.nodeType === 3 ? n.parentNode : n);
            });
          });
          if (pending.length && !queued) { queued = true; requestAnimationFrame(flush); }
        }).observe(root, { childList: true, subtree: true, characterData: false });
      });
    });
  }

  // A link inside a clickable row goes where it says, not to the row.
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a.oer-xref");
    if (a) e.stopPropagation();
  }, true);

  var css = document.createElement("style");
  css.textContent = "a.oer-xref{color:inherit;text-decoration:underline;text-underline-offset:2px}" +
    "a.oer-xref:hover,a.oer-xref:focus{text-decoration-thickness:2px}";
  (document.head || document.documentElement).appendChild(css);

  window.oerXref = { load: load, scan: scan, find: find, KINDS: KINDS };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
