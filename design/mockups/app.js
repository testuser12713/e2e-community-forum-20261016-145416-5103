/* Shared vanilla-JS interactions for the Community-Forum mockup set.
   Plain static JS. No external dependencies, no network requests. */
(function () {
  "use strict";

  var root = document.documentElement;

  function applyTheme(mode) {
    var dark = mode === "dark" ||
      (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.setAttribute("data-theme", dark ? "dark" : "light");
    try { localStorage.setItem("theme", mode); } catch (e) {}
  }
  window.odApplyTheme = applyTheme;

  window.odToggleTheme = function () {
    var current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
    syncThemeControls();
  };

  function syncThemeControls() {
    var mode = "system";
    try { mode = localStorage.getItem("theme") || "system"; } catch (e) {}
    document.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
      btn.setAttribute("aria-selected", btn.getAttribute("data-theme-choice") === mode ? "true" : "false");
    });
  }

  function closeAll(except) {
    document.querySelectorAll("[data-popover]").forEach(function (p) {
      if (p !== except) p.hidden = true;
    });
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target;

    // Theme toggle button
    var toggle = t.closest("[data-theme-toggle]");
    if (toggle) { window.odToggleTheme(); return; }

    // Explicit theme choice (segmented control)
    var choice = t.closest("[data-theme-choice]");
    if (choice) { applyTheme(choice.getAttribute("data-theme-choice")); syncThemeControls(); return; }

    // Popover / menu triggers
    var trigger = t.closest("[data-popover-trigger]");
    if (trigger) {
      ev.preventDefault();
      var id = trigger.getAttribute("data-popover-trigger");
      var pop = document.getElementById(id);
      if (pop) {
        var willOpen = pop.hidden;
        closeAll();
        pop.hidden = !willOpen;
      }
      return;
    }
    if (!t.closest("[data-popover]")) closeAll();

    // Tabs (sort tabs / editor tabs / profile tabs)
    var tab = t.closest("[data-tab]");
    if (tab) {
      var group = tab.closest("[data-tabgroup]");
      if (group) {
        group.querySelectorAll("[data-tab]").forEach(function (el) { el.setAttribute("aria-selected", "false"); });
        tab.setAttribute("aria-selected", "true");
        var panelId = tab.getAttribute("data-panel");
        if (panelId) {
          group.querySelectorAll("[data-panel-view]").forEach(function (v) { v.hidden = true; });
          var panel = document.getElementById(panelId);
          if (panel) panel.hidden = false;
        }
      }
      return;
    }

    // Modal openers
    var opener = t.closest("[data-modal-open]");
    if (opener) {
      ev.preventDefault();
      var m = document.getElementById(opener.getAttribute("data-modal-open"));
      if (m) m.hidden = false;
      return;
    }

    // Modal close
    var closer = t.closest("[data-modal-close]");
    if (closer) {
      var ov = closer.closest(".overlay");
      if (ov) ov.hidden = true;
      return;
    }
    if (t.classList && t.classList.contains("overlay")) { t.hidden = true; return; }

    // Toast dismiss
    var toastX = t.closest("[data-toast-close]");
    if (toastX) { var card = toastX.closest(".toast"); if (card) card.remove(); return; }

    // Vote buttons
    var vote = t.closest("[data-vote]");
    if (vote && !vote.disabled) {
      var control = vote.closest(".vote-control");
      var scoreEl = control && control.querySelector(".vote-score");
      var dir = vote.getAttribute("data-vote");
      var cur = control.getAttribute("data-voted") || "";
      var base = parseInt(control.getAttribute("data-base") || "0", 10);
      var next, delta = 0;
      if (cur === dir) { next = ""; delta = dir === "up" ? -1 : 1; }
      else if (cur === "") { next = dir; delta = dir === "up" ? 1 : -1; }
      else { next = dir; delta = dir === "up" ? 2 : -2; }
      control.setAttribute("data-voted", next);
      control.classList.toggle("vote-control--up", next === "up");
      control.classList.toggle("vote-control--down", next === "down");
      if (scoreEl) scoreEl.textContent = (base + delta > 0 ? "+" : "") + (base + delta);
      return;
    }

    // Reply toggle
    var reply = t.closest("[data-reply-toggle]");
    if (reply) {
      var target = document.getElementById(reply.getAttribute("data-reply-toggle"));
      if (target) target.hidden = !target.hidden;
      return;
    }

    // Collapse subtree
    var collapse = t.closest("[data-collapse]");
    if (collapse) {
      var sub = document.getElementById(collapse.getAttribute("data-collapse"));
      var label = collapse.querySelector("span");
      if (sub) {
        sub.hidden = !sub.hidden;
        if (label) label.textContent = sub.hidden ? "3 Antworten" : "Ausblenden";
      }
      return;
    }

    // Admin mobile drawer
    var drawerOpen = t.closest("[data-drawer-open]");
    if (drawerOpen) { var d = document.getElementById("admin-drawer"); if (d) d.hidden = false; return; }
    var drawerClose = t.closest("[data-drawer-close]");
    if (drawerClose) { var d2 = document.getElementById("admin-drawer"); if (d2) d2.hidden = true; return; }
    if (t.classList && t.classList.contains("drawer-scrim")) {
      var d3 = document.getElementById("admin-drawer"); if (d3) d3.hidden = true; return;
    }

    // Editor tab preview (Schreiben / Vorschau)
    var etab = t.closest("[data-editor-tab]");
    if (etab) {
      var editor = etab.closest(".editor");
      var which = etab.getAttribute("data-editor-tab");
      editor.querySelectorAll("[data-editor-tab]").forEach(function (el) { el.setAttribute("aria-selected", "false"); });
      etab.setAttribute("aria-selected", "true");
      var src = editor.querySelector("textarea");
      var prev = editor.querySelector("[data-editor-preview]");
      if (which === "preview" && prev && src) {
        prev.hidden = false;
        src.hidden = true;
        prev.innerHTML = mm(src.value);
      } else if (src) {
        src.hidden = false;
        if (prev) prev.hidden = true;
      }
      return;
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeAll();
      document.querySelectorAll(".overlay").forEach(function (o) { o.hidden = true; });
      var d = document.getElementById("admin-drawer"); if (d) d.hidden = true;
    }
  });

  // Tiny sanitising markdown renderer for the Vorschau tab (demo only).
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function mm(text) {
    var safe = esc(text || "");
    var lines = safe.split(/\n/);
    var out = [], inList = false, inCode = false;
    lines.forEach(function (line) {
      if (/^```/.test(line)) { inCode = !inCode; out.push(inCode ? "<pre><code>" : "</code></pre>"); return; }
      if (inCode) { out.push(line); return; }
      line = line
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/@([A-Za-z0-9_]+)/g, '<a href="profile.html">@$1</a>');
      if (/^#{1,3}\s/.test(line)) {
        var n = line.match(/^#+/)[0].length;
        out.push("<h" + (n + 1) + ">" + line.replace(/^#+\s/, "") + "</h" + (n + 1) + ">");
        return;
      }
      if (/^>\s?/.test(line)) { out.push("<blockquote>" + line.replace(/^>\s?/, "") + "</blockquote>"); return; }
      if (/^[-*]\s/.test(line)) {
        if (!inList) { out.push("<ul>"); inList = true; }
        out.push("<li>" + line.replace(/^[-*]\s/, "") + "</li>");
        return;
      }
      if (inList) { out.push("</ul>"); inList = false; }
      if (line.trim() === "") { return; }
      out.push("<p>" + line + "</p>");
    });
    if (inList) out.push("</ul>");
    return out.join("\n");
  }

  document.addEventListener("DOMContentLoaded", syncThemeControls);
})();
