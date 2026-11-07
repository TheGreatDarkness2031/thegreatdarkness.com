// Site navigation rules for thegreatdarkness.com (every page loads this).
//  1. Pages on this site open in the same tab, so the browser's Back
//     button always works. Other websites open in a new tab.
//  2. CLOSE buttons (from when pages opened in their own windows) go back
//     instead: browsers won't close a tab the visitor opened.
//  3. A page with no link home gets a small HOME link in the corner.
(function() {
  var HOME = "/home/";

  function sameSite(url) {
    try {
      return new URL(url, location.href).origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  function goBack() {
    if (document.referrer && sameSite(document.referrer) && history.length > 1) {
      history.back();
    } else {
      location.href = HOME;
    }
  }
  window.tgdBack = goBack;

  // 2. window.close() on a page the visitor opened does nothing.
  if (!window.opener) {
    window.close = goBack;
  }

  // 1. Scripts that open site pages in a new window: same tab instead.
  var realOpen = window.open;
  window.open = function(url) {
    if (url && sameSite(url)) {
      location.href = new URL(url, location.href).href;
      return null;
    }
    return realOpen.apply(window, arguments);
  };

  // 1. Links (including ones pages add later).
  document.addEventListener("click", function(e) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      return;
    }
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) {
      return;
    }
    var href = a.getAttribute("href") || "";
    if (href === "" || href.charAt(0) === "#" || /^(javascript|mailto|tel):/i.test(href)) {
      return;
    }
    if (sameSite(a.href)) {
      if (a.target && a.target !== "_self") {
        a.removeAttribute("target");
      }
    } else if (!a.target) {
      a.target = "_blank";
      a.rel = "noopener";
    }
  }, true);

  function tidyPage() {
    // 2. Label the old CLOSE buttons BACK.
    var closers = document.querySelectorAll("[onclick]");
    for (var i = 0; i !== closers.length; i++) {
      var el = closers[i];
      var code = el.getAttribute("onclick") || "";
      if (/window\.close\(|close\w*View\(/.test(code) && /^\s*\[?\s*CLOSE\s*\]?\s*$/i.test(el.textContent)) {
        el.textContent = el.textContent.replace(/CLOSE/i, "BACK");
      }
    }

    // 3. HOME link for pages without one.
    if (location.pathname === HOME || location.pathname === "/") {
      return;
    }
    var links = document.querySelectorAll("a[href]");
    for (var j = 0; j !== links.length; j++) {
      var p = links[j].getAttribute("href");
      if (p === HOME || p === "/arcade/" || p === "/tools/") {
        return;
      }
    }
    var home = document.createElement("a");
    home.href = HOME;
    home.className = "tgd-home-link";
    home.textContent = "◄ HOME";
    home.setAttribute("aria-label", "Back to the homepage");
    var style = document.createElement("style");
    style.textContent =
      ".tgd-home-link{position:fixed;left:8px;bottom:8px;z-index:99999;" +
      "padding:5px 9px;background:rgba(0,0,0,0.82);border:1px solid #777;" +
      "color:#ddd;font:bold 11px/1 'Courier New',Courier,monospace;letter-spacing:1px;" +
      "text-decoration:none}" +
      ".tgd-home-link:hover,.tgd-home-link:focus{background:#fff;color:#000;border-color:#fff}";
    document.head.appendChild(style);
    document.body.appendChild(home);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tidyPage);
  } else {
    tidyPage();
  }
})();
