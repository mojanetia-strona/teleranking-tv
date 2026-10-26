/*
 * TeleRanking: porównywarka kanałów TV [teleranking_tv]
 * Klient wybiera kanały, widzi, kto ma je wszystkie i od jakiego pakietu.
 * Kolejność wyników: najpierw dopasowanie (brakujące kanały, potrzebne dodatki), przy remisie kolejność TeleRanking.
 * Czysty JS, bez zależności.
 */
(function () {
  "use strict";

  var MAX_SEL = 12;

  /* ---------- pomocnicze ---------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fold(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
  }
  function skey(s) { return fold(s).replace(/\+/g, "plus").replace(/[^a-z0-9]/g, ""); }
  function track(ev, params) {
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: ev }, params || {})); } catch (e) { /* bez analityki */ }
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (n === 1) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  // "pakiet Extra TV", ale "Pakiet M" (bez podwójnego "pakiet")
  function lbl(word, name) {
    return /^(pakiet|kanał)/i.test(name) ? esc(name) : word + " " + esc(name);
  }
  function dataPL(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? m[3] + "." + m[2] + "." + m[1] : "";
  }
  function initials(n) {
    var w = String(n || "").replace(/[^0-9A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż+ ]/g, " ").trim().split(/\s+/);
    var s = (w[0] || "").slice(0, w.length > 1 ? 1 : 3) + (w[1] ? w[1].slice(0, 1) : "");
    return (s || "TV").toUpperCase();
  }

  function Widget(root) {
    this.root = root;
    this.cfg = {
      src: root.getAttribute("data-src"),
      logos: (root.getAttribute("data-logos") || "").replace(/\/?$/, "/"),
      cta: root.hasAttribute("data-cta") ? root.getAttribute("data-cta") : "/",
      ctaLabel: root.getAttribute("data-cta-label") || "Sprawdź pod swoim adresem",
      opLogos: {},
    };
    try { this.cfg.opLogos = JSON.parse(root.getAttribute("data-op-logos") || "{}"); } catch (e) { /* bez logo */ }
    this.sel = [];
    this.tab = "wyniki";
    this.lineChoice = {};
    this.load();
  }

  Widget.prototype.load = function () {
    var self = this;
    fetch(this.cfg.src, { credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { self.init(d); })
      .catch(function () {
        self.root.querySelector(".trtv-body").innerHTML =
          '<p class="trtv-error">Nie udało się wczytać listy kanałów. Odśwież stronę albo zadzwoń do nas, sprawdzimy to za Ciebie.</p>';
      });
  };

  Widget.prototype.init = function (d) {
    var self = this;
    this.d = d;
    this.K = d.kanaly;
    this.keys = Object.keys(this.K);
    this.search = this.keys.map(function (k) { return { k: k, f: fold(self.K[k].n).replace(/[^a-z0-9+ ]/g, ""), c: skey(self.K[k].n) }; });
    this.ops = d.operatorzy.slice();
    this.order = {};
    this.ord = function (slug) { return slug in self.order ? self.order[slug] : 99; };
    (d.kolejnosc || []).forEach(function (s, i) { self.order[s] = i; });
    // ile operatorów ma dany kanał (podpowiedzi)
    this.reach = {};
    this.ops.forEach(function (o) {
      var seen = {};
      o.linie.forEach(function (L) { L.pakiety.concat(L.dodatki).forEach(function (p) { p.kanaly.forEach(function (k) { seen[k] = 1; }); }); });
      Object.keys(seen).forEach(function (k) { self.reach[k] = (self.reach[k] || 0) + 1; });
    });
    // stan z adresu (?kanaly=...)
    try {
      var q = new URLSearchParams(location.search).get("kanaly");
      if (q) q.split(",").forEach(function (k) { if (self.K[k] && self.sel.indexOf(k) < 0) self.sel.push(k); });
    } catch (e) { /* stary przeglądarka */ }
    var h = (location.hash || "").replace(/^#\/?/, "").split("/");
    if (h[0] === "pakiety") this.tab = "pakiety";
    else if (h[0] === "streaming") this.tab = "streaming";
    this.renderShell();
    this.renderAll();
  };

  /* ---------- logotypy ---------- */
  Widget.prototype.logo = function (k, cls) {
    var c = this.K[k] || { n: k };
    var ini = esc(initials(c.n));
    if (c.l) {
      return '<span class="trtv-logo ' + (cls || "") + '"><img src="' + esc(this.cfg.logos + k + ".webp") + '" alt="" loading="lazy" decoding="async" width="80" height="48" data-i="' + ini + '"></span>';
    }
    return '<span class="trtv-logo trtv-logo--txt ' + (cls || "") + '" aria-hidden="true">' + ini + "</span>";
  };
  Widget.prototype.fixImgs = function (scope) {
    (scope || this.root).querySelectorAll(".trtv-logo img:not([data-ok])").forEach(function (img) {
      img.setAttribute("data-ok", "1");
      img.addEventListener("error", function () {
        var s = img.parentNode;
        s.classList.add("trtv-logo--txt");
        s.textContent = img.getAttribute("data-i");
      }, { once: true });
    });
  };
  Widget.prototype.opLogo = function (o) {
    var u = this.cfg.opLogos[o.slug];
    return u ? '<img class="trtv-oplogo" src="' + esc(u) + '" alt="' + esc(o.nazwa) + '" width="113" height="30" loading="lazy" decoding="async" onerror="this.outerHTML=\'<strong class=trtv-opname>\'+this.alt+\'</strong>\'">'
      : '<strong class="trtv-opname">' + esc(o.nazwa) + "</strong>";
  };

  /* ---------- szkielet ---------- */
  Widget.prototype.renderShell = function () {
    var self = this, d = this.d;
    var nOps = this.ops.length, nK = this.keys.length;
    this.root.querySelector(".trtv-body").innerHTML =
      '<div class="trtv-head">' +
        '<h2 class="trtv-title">Jakie kanały chcesz oglądać?</h2>' +
        '<p class="trtv-lead">Dodaj kanały, które oglądasz. Pokażemy, który operator ma je wszystkie i od jakiego pakietu. ' +
        nK + " kanałów u " + nOps + " operatorów, dane z ich oficjalnych stron.</p>" +
      "</div>" +
      '<div class="trtv-find">' +
        '<div class="trtv-combo" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-owns="trtv-sug-' + this.uid() + '">' +
          '<svg class="trtv-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>' +
          '<input class="trtv-input" type="search" autocomplete="off" spellcheck="false" placeholder="Wpisz kanał, np. Eleven Sports, TVN24, HBO" aria-label="Wyszukaj kanał" aria-autocomplete="list" aria-controls="trtv-sug-' + this.uid() + '">' +
        "</div>" +
        '<ul class="trtv-sug" id="trtv-sug-' + this.uid() + '" role="listbox" hidden></ul>' +
      "</div>" +
      '<div class="trtv-pop"><span class="trtv-pop-lbl">Najczęściej wybierane</span><div class="trtv-pop-list"></div></div>' +
      '<div class="trtv-my" hidden></div>' +
      '<div class="trtv-tabs" role="tablist">' +
        '<button type="button" role="tab" data-tab="wyniki">Kto ma moje kanały</button>' +
        '<button type="button" role="tab" data-tab="pakiety">Pakiety operatorów</button>' +
        '<button type="button" role="tab" data-tab="streaming">Streaming</button>' +
      "</div>" +
      '<div class="trtv-panel" role="tabpanel" aria-live="polite"></div>' +
      '<p class="trtv-note">Kolejność wyników: najpierw operatorzy, u których masz więcej wybranych kanałów i potrzebujesz mniej dodatków. Przy takim samym dopasowaniu obowiązuje kolejność ustalona przez TeleRanking. Dane z oficjalnych stron operatorów, aktualizowane co tydzień (ostatnio ' + esc(dataPL(d.aktualizacja)) + "). Dostępność pakietów zależy od adresu.</p>" +
      '<div class="trtv-bar" hidden><span class="trtv-bar-txt"></span><button type="button" class="trtv-bar-btn">Pokaż wyniki</button></div>' +
      '<dialog class="trtv-dlg" aria-labelledby="trtv-dlg-t-' + this.uid() + '"><div class="trtv-dlg-in"></div></dialog>';

    this.$input = this.root.querySelector(".trtv-input");
    this.$sug = this.root.querySelector(".trtv-sug");
    this.$combo = this.root.querySelector(".trtv-combo");
    this.$panel = this.root.querySelector(".trtv-panel");
    this.$dlg = this.root.querySelector(".trtv-dlg");
    this.$bar = this.root.querySelector(".trtv-bar");

    // popularne
    this.root.querySelector(".trtv-pop-list").innerHTML = (d.popularne || []).filter(function (k) { return self.K[k]; }).map(function (k) {
      return '<button type="button" class="trtv-popbtn" data-k="' + esc(k) + '" aria-pressed="false">' + self.logo(k) + "<span>" + esc(self.K[k].n) + "</span></button>";
    }).join("");

    this.bind();
  };

  Widget.prototype.uid = function () {
    if (!this._uid) this._uid = Math.random().toString(36).slice(2, 8);
    return this._uid;
  };

  /* ---------- zdarzenia ---------- */
  Widget.prototype.bind = function () {
    var self = this, root = this.root;
    this.active = -1;

    this.$input.addEventListener("input", function () { self.suggest(); });
    this.$input.addEventListener("focus", function () { if (self.$input.value) self.suggest(); });
    this.$input.addEventListener("keydown", function (e) {
      var items = self.$sug.querySelectorAll("[role=option]");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!items.length) return;
        e.preventDefault();
        self.active = (self.active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach(function (it, i) { it.setAttribute("aria-selected", i === self.active ? "true" : "false"); });
        items[self.active].scrollIntoView({ block: "nearest" });
        self.$input.setAttribute("aria-activedescendant", items[self.active].id);
      } else if (e.key === "Enter") {
        e.preventDefault();
        var it = items[self.active >= 0 ? self.active : 0];
        if (it) self.add(it.getAttribute("data-k"), "szukaj");
      } else if (e.key === "Escape") {
        self.closeSug();
      }
    });
    document.addEventListener("click", function (e) {
      if (!root.querySelector(".trtv-find").contains(e.target)) self.closeSug();
    });
    this.$sug.addEventListener("mousedown", function (e) { e.preventDefault(); });
    this.$sug.addEventListener("click", function (e) {
      var it = e.target.closest("[data-k]");
      if (it) self.add(it.getAttribute("data-k"), "szukaj");
    });

    root.addEventListener("click", function (e) {
      var t = e.target.closest("button, a");
      if (!t || !root.contains(t)) return;
      if (t.classList.contains("trtv-popbtn")) {
        var k = t.getAttribute("data-k");
        if (self.sel.indexOf(k) >= 0) self.remove(k); else self.add(k, "popularne");
      } else if (t.classList.contains("trtv-chip-x")) {
        self.remove(t.getAttribute("data-k"));
      } else if (t.classList.contains("trtv-clear")) {
        self.sel = [];
        self.changed();
      } else if (t.hasAttribute("data-tab")) {
        self.setTab(t.getAttribute("data-tab"));
      } else if (t.hasAttribute("data-open")) {
        var p = t.getAttribute("data-open").split("|");
        self.openPkg(p[0], p[1], p[2]);
      } else if (t.hasAttribute("data-line")) {
        var q = t.getAttribute("data-line").split("|");
        self.lineChoice[q[0]] = q[1];
        self.renderPanel();
      } else if (t.classList.contains("trtv-cta")) {
        track("tv_cta_adres", { operator: t.getAttribute("data-op") || "", kanaly: self.sel.length });
      } else if (t.classList.contains("trtv-bar-btn")) {
        self.setTab("wyniki");
        self.$panel.scrollIntoView({ behavior: self.motion() ? "smooth" : "auto", block: "start" });
      }
    });

    // pasek na dole (telefon): gdy wyniki są poza ekranem
    if ("IntersectionObserver" in window) {
      this.panelVisible = true;
      new IntersectionObserver(function (en) {
        self.panelVisible = en[0].isIntersecting;
        self.updateBar();
      }, { rootMargin: "0px 0px -35% 0px" }).observe(this.$panel);
      new IntersectionObserver(function (en) {
        self.rootVisible = en[0].isIntersecting;
        self.updateBar();
      }).observe(this.root);
    }

    this.$dlg.addEventListener("click", function (e) {
      if (e.target === self.$dlg || e.target.closest(".trtv-dlg-x")) self.$dlg.close();
    });
  };

  Widget.prototype.motion = function () {
    return !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  /* ---------- wyszukiwarka ---------- */
  Widget.prototype.suggest = function () {
    var self = this;
    var raw = this.$input.value.trim();
    var t = fold(raw).replace(/[^a-z0-9+ ]/g, ""), tc = skey(raw);
    if (!t) { this.closeSug(); return; }
    var res = this.search.filter(function (s) { return s.f.indexOf(t) >= 0 || s.c.indexOf(tc) >= 0; });
    res.sort(function (a, b) {
      var sa = a.c.indexOf(tc) === 0 ? 0 : 1, sb = b.c.indexOf(tc) === 0 ? 0 : 1;
      return sa - sb || (self.reach[b.k] || 0) - (self.reach[a.k] || 0) || a.f.localeCompare(b.f);
    });
    res = res.slice(0, 8);
    this.active = res.length ? 0 : -1;
    var uid = this.uid();
    this.$sug.innerHTML = res.length ? res.map(function (s, i) {
      var k = s.k, on = self.sel.indexOf(k) >= 0, r = self.reach[k] || 0;
      return '<li role="option" id="trtv-o-' + uid + "-" + i + '" data-k="' + esc(k) + '" aria-selected="' + (i === 0) + '">' +
        self.logo(k, "trtv-logo--sm") + '<span class="trtv-sug-n">' + esc(self.K[k].n) + "</span>" +
        '<span class="trtv-sug-m">' + (on ? "dodany" : r + " " + plural(r, "operator", "operatorów", "operatorów")) + "</span></li>";
    }).join("") : '<li class="trtv-sug-empty">Nie znamy takiego kanału. Spróbuj krótszej nazwy, np. „Polsat Sport”.</li>';
    this.$sug.hidden = false;
    this.$combo.setAttribute("aria-expanded", "true");
    this.fixImgs(this.$sug);
  };
  Widget.prototype.closeSug = function () {
    this.$sug.hidden = true;
    this.$combo.setAttribute("aria-expanded", "false");
    this.$input.removeAttribute("aria-activedescendant");
  };

  Widget.prototype.add = function (k, src) {
    if (!this.K[k]) return;
    if (this.sel.indexOf(k) < 0) {
      if (this.sel.length >= MAX_SEL) this.sel.shift();
      this.sel.push(k);
      track("tv_kanal_dodany", { kanal: this.K[k].n, zrodlo: src || "" });
    }
    this.$input.value = "";
    this.closeSug();
    this.tab = "wyniki";
    this.changed();
  };
  Widget.prototype.remove = function (k) {
    this.sel = this.sel.filter(function (x) { return x !== k; });
    this.changed();
  };
  Widget.prototype.changed = function () {
    try {
      var u = new URL(location.href);
      if (this.sel.length) u.searchParams.set("kanaly", this.sel.join(",")); else u.searchParams.delete("kanaly");
      history.replaceState(history.state, "", u.toString());
    } catch (e) { /* bez historii */ }
    this.renderAll();
  };

  Widget.prototype.setTab = function (t) {
    this.tab = t;
    track("tv_zakladka", { zakladka: t });
    this.renderAll();
  };

  /* ---------- dopasowanie ---------- */
  // Najmniejszy pakiet bazowy + dodatki dla wybranych kanałów w danej linii oferty.
  Widget.prototype.matchLine = function (L, sel) {
    var best = null;
    L.pakiety.forEach(function (p, i) {
      var inP = {}; p.kanaly.forEach(function (k) { inP[k] = 1; });
      var rest = sel.filter(function (k) { return !inP[k]; });
      var adds = [], via = {};
      // zachłannie: dodatek pokrywający najwięcej brakujących, przy remisie mniejszy
      var left = rest.slice();
      while (left.length) {
        var pick = null, cov = 0;
        L.dodatki.forEach(function (d) {
          if (adds.indexOf(d) >= 0) return;
          var c = 0; for (var j = 0; j < left.length; j++) if (d.kanaly.indexOf(left[j]) >= 0) c++;
          if (c > cov || (c === cov && c > 0 && pick && d.kanaly.length < pick.kanaly.length)) { pick = d; cov = c; }
        });
        if (!pick) break;
        adds.push(pick);
        left = left.filter(function (k) { if (pick.kanaly.indexOf(k) >= 0) { via[k] = pick; return false; } return true; });
      }
      var r = { pkg: p, idx: i, adds: adds, via: via, missing: left, inP: inP };
      var s = [left.length, adds.length, i];
      if (!best || s[0] < best.s[0] || (s[0] === best.s[0] && (s[1] < best.s[1] || (s[1] === best.s[1] && s[2] < best.s[2])))) { r.s = s; best = r; }
    });
    return best;
  };

  Widget.prototype.results = function () {
    var self = this, sel = this.sel;
    var out = this.ops.map(function (o) {
      var best = null, bestLine = null;
      o.linie.forEach(function (L) {
        var m = self.matchLine(L, sel);
        if (m && (!best || m.s[0] < best.s[0] || (m.s[0] === best.s[0] && m.s[1] < best.s[1]))) { best = m; bestLine = L; }
      });
      return { o: o, m: best, L: bestLine };
    }).filter(function (r) { return r.m; });
    out.sort(function (a, b) {
      return a.m.s[0] - b.m.s[0] || a.m.s[1] - b.m.s[1] || self.ord(a.o.slug) - self.ord(b.o.slug);
    });
    return out;
  };

  /* ---------- render ---------- */
  Widget.prototype.renderAll = function () {
    var self = this;
    // popularne: stan
    this.root.querySelectorAll(".trtv-popbtn").forEach(function (b) {
      b.setAttribute("aria-pressed", self.sel.indexOf(b.getAttribute("data-k")) >= 0 ? "true" : "false");
    });
    // moje kanały
    var my = this.root.querySelector(".trtv-my");
    if (this.sel.length) {
      my.hidden = false;
      my.innerHTML = '<span class="trtv-my-lbl">Twoje kanały</span><div class="trtv-chips">' + this.sel.map(function (k) {
        return '<span class="trtv-chip">' + self.logo(k, "trtv-logo--xs") + "<span>" + esc(self.K[k].n) + "</span>" +
          '<button type="button" class="trtv-chip-x" data-k="' + esc(k) + '" aria-label="Usuń ' + esc(self.K[k].n) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></span>';
      }).join("") + '</div><button type="button" class="trtv-clear">Wyczyść</button>';
    } else {
      my.hidden = true;
      my.innerHTML = "";
    }
    // zakładki
    this.root.querySelectorAll("[data-tab]").forEach(function (b) {
      var on = b.getAttribute("data-tab") === self.tab;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    this.renderPanel();
    this.updateBar();
    this.fixImgs();
  };

  Widget.prototype.updateBar = function () {
    var show = this.sel.length > 0 && this.panelVisible === false && this.rootVisible !== false && this.tab === "wyniki";
    this.$bar.hidden = !show;
    if (show) {
      var r = this.results(), all = r.filter(function (x) { return !x.m.missing.length; }).length;
      this.$bar.querySelector(".trtv-bar-txt").textContent = this.sel.length + " " + plural(this.sel.length, "kanał", "kanały", "kanałów") +
        ", wszystkie ma " + all + " " + plural(all, "operator", "operatorów", "operatorów");
    }
  };

  Widget.prototype.renderPanel = function () {
    if (this.tab === "pakiety") this.renderPakiety();
    else if (this.tab === "streaming") this.renderStreaming();
    else if (!this.sel.length) this.renderPakiety(true);
    else this.renderWyniki();
    this.fixImgs(this.$panel);
  };

  Widget.prototype.ctaHref = function (o) {
    return this.cfg.cta;
  };

  Widget.prototype.renderWyniki = function () {
    var self = this, sel = this.sel, res = this.results();
    var full = res.filter(function (r) { return !r.m.missing.length; });
    var part = res.filter(function (r) { return r.m.missing.length; });
    track("tv_wyniki", { kanaly: sel.length, wszystkie_u: full.length });

    function strip(r) {
      return '<ul class="trtv-strip" aria-label="Twoje kanały u ' + esc(r.o.nazwa) + '">' + sel.map(function (k) {
        var st = r.m.inP[k] ? "in" : (r.m.via[k] ? "add" : "no");
        var t = st === "in" ? "w pakiecie" : (st === "add" ? "w dodatku " + r.m.via[k].nazwa : "niedostępny");
        return '<li class="trtv-s trtv-s--' + st + '" title="' + esc(self.K[k].n + ": " + t) + '">' + self.logo(k, "trtv-logo--sm") +
          '<span class="trtv-vh">' + esc(self.K[k].n + ": " + t) + "</span>" +
          (st === "add" ? '<span class="trtv-s-b" aria-hidden="true">+</span>' : "") +
          (st === "no" ? '<span class="trtv-s-b" aria-hidden="true">×</span>' : "") + "</li>";
      }).join("") + "</ul>";
    }
    function card(r, big) {
      var m = r.m, o = r.o, L = r.L;
      var line = o.linie.length > 1 ? '<span class="trtv-line">' + esc(L.nazwa) + "</span>" : "";
      var verdict;
      if (!m.missing.length && !m.adds.length) {
        verdict = '<p class="trtv-v trtv-v--ok">Wszystkie w ' + (/^pakiet/i.test(m.pkg.nazwa) ? "<b>" + esc(m.pkg.nazwa) + "</b>" : "pakiecie <b>" + esc(m.pkg.nazwa) + "</b>") + "</p>";
      } else if (!m.missing.length) {
        verdict = '<p class="trtv-v trtv-v--ok">Wszystkie: <b>' + lbl("pakiet", m.pkg.nazwa) + "</b> + " +
          m.adds.map(function (a) { return "<b>" + lbl("dodatek", a.nazwa) + "</b>"; }).join(" + ") + "</p>";
      } else {
        verdict = '<p class="trtv-v trtv-v--part">Brakuje: ' + m.missing.map(function (k) { return esc(self.K[k].n); }).join(", ") + "</p>" +
          '<p class="trtv-v2">Najwięcej z nich: <b>' + lbl("pakiet", m.pkg.nazwa) + "</b>" +
          (m.adds.length ? " + " + m.adds.map(function (a) { return esc(a.nazwa); }).join(" + ") : "") + "</p>";
      }
      return '<article class="trtv-res' + (big ? " trtv-res--full" : " trtv-res--part") + '">' +
        '<div class="trtv-res-top">' + self.opLogo(o) + line +
          '<span class="trtv-res-n">' + esc(m.pkg.liczba) + " " + plural(m.pkg.liczba, "kanał", "kanały", "kanałów") + " w pakiecie</span></div>" +
        verdict + strip(r) +
        '<div class="trtv-res-act">' +
          (big && self.cfg.cta ? '<a class="trtv-btn trtv-btn--cta trtv-cta" data-op="' + esc(o.slug) + '" href="' + esc(self.ctaHref(o)) + '">' + esc(self.cfg.ctaLabel) + "</a>" : "") +
          '<button type="button" class="trtv-btn trtv-btn--ghost" data-open="' + esc(o.slug + "|" + L.id + "|" + m.pkg.id) + '">Zobacz kanały w pakiecie</button>' +
        "</div></article>";
    }

    var h = "";
    if (full.length) {
      h += '<h3 class="trtv-h3">Wszystkie Twoje kanały ma ' + full.length + " " + plural(full.length, "operator", "operatorów", "operatorów") + "</h3>";
      h += '<div class="trtv-res-list">' + full.map(function (r) { return card(r, true); }).join("") + "</div>";
    } else {
      h += '<div class="trtv-empty"><h3 class="trtv-h3">Żaden operator nie ma wszystkich wybranych kanałów</h3>' +
        "<p>Usuń jeden z kanałów albo zobacz niżej, u kogo brakuje najmniej. Możemy też doradzić przez telefon.</p></div>";
    }
    if (part.length) {
      h += '<h3 class="trtv-h3 trtv-h3--muted">Mają część kanałów</h3>';
      h += '<div class="trtv-res-list trtv-res-list--part">' + part.map(function (r) { return card(r, false); }).join("") + "</div>";
    }
    this.$panel.innerHTML = h;
  };

  // Przegląd: operatorzy i ich pakiety
  Widget.prototype.renderPakiety = function (intro) {
    var self = this;
    var ops = this.ops.slice().sort(function (a, b) { return self.ord(a.slug) - self.ord(b.slug); });
    var h = intro ? '<p class="trtv-hint">Dodaj kanał powyżej, a pokażemy, kto ma wszystkie Twoje kanały. Poniżej pakiety wszystkich operatorów.</p>' : "";
    h += '<div class="trtv-ops">' + ops.map(function (o) {
      var Lid = self.lineChoice[o.slug] || o.linie[0].id;
      var L = o.linie.filter(function (x) { return x.id === Lid; })[0] || o.linie[0];
      var max = L.pakiety.reduce(function (m, p) { return Math.max(m, p.liczba); }, 0);
      return '<section class="trtv-op">' +
        '<div class="trtv-op-top">' + self.opLogo(o) + '<span class="trtv-op-max"><b>' + max + "</b> kanałów maks.</span></div>" +
        (o.linie.length > 1 ? '<div class="trtv-seg" role="group" aria-label="Rodzaj telewizji">' + o.linie.map(function (x) {
          return '<button type="button" data-line="' + esc(o.slug + "|" + x.id) + '" aria-pressed="' + (x.id === L.id) + '">' + esc(x.nazwa) + "</button>";
        }).join("") + "</div>" : "") +
        '<div class="trtv-pk">' + L.pakiety.map(function (p) {
          return '<button type="button" class="trtv-pkb" data-open="' + esc(o.slug + "|" + L.id + "|" + p.id) + '"><span>' + esc(p.nazwa) + "</span><b>" + p.liczba + "</b></button>";
        }).join("") + "</div>" +
        (L.dodatki.length ? '<button type="button" class="trtv-link" data-open="' + esc(o.slug + "|" + L.id + "|" + L.dodatki[0].id) + '">Pakiety dodatkowe (' + L.dodatki.length + ")</button>" : "") +
        '<p class="trtv-op-src">Stan na ' + esc(dataPL(o.stan_na)) + "</p>" +
        "</section>";
    }).join("") + "</div>";
    this.$panel.innerHTML = h;
  };

  Widget.prototype.renderStreaming = function () {
    var self = this;
    var ORDER = ["netflix", "hbomax", "disneyplus", "skyshowtime", "amazonprimevideo", "canalplusonline", "polsatboxgo", "appletv", "elevensports", "player", "viaplay", "filmboxplus"];
    var TYP = { w_cenie: [0, "W cenie", "ok"], platny: [1, "Płatny dodatek", "paid"], konto: [2, "Własne konto", "own"] };
    var groups = {};
    this.ops.forEach(function (o) {
      o.streaming.forEach(function (s) {
        if (ORDER.indexOf(s.key) < 0) return;
        var g = groups[s.key] = groups[s.key] || { n: s.serwis, l: 0, on: [], off: [] };
        if (s.l) g.l = 1;
        if (!s.dostepny || s.typ === "brak") { if (g.off.indexOf(o.nazwa) < 0) g.off.push(o.nazwa); }
        else g.on.push({ o: o, s: s });
      });
    });
    var keys = ORDER.filter(function (k) { return groups[k]; });
    if (!this.svc || keys.indexOf(this.svc) < 0) this.svc = keys[0];
    var g = groups[this.svc];
    g.on.sort(function (a, b) {
      var ta = (TYP[a.s.typ] || [1])[0], tb = (TYP[b.s.typ] || [1])[0];
      return ta - tb || self.ord(a.o.slug) - self.ord(b.o.slug);
    });
    var logo = function (k, cls) {
      return groups[k].l ? '<span class="trtv-slogo ' + (cls || "") + '"><img src="' + esc(self.cfg.logos + "s-" + k + ".webp") + '" alt="" decoding="async"></span>'
        : '<span class="trtv-slogo trtv-slogo--txt ' + (cls || "") + '">' + esc(initials(groups[k].n)) + "</span>";
    };
    var inc = g.on.filter(function (x) { return x.s.typ === "w_cenie"; }).map(function (x) { return x.o.nazwa; });
    var summary = inc.length ? "W cenie pakietu lub oferty u: " + inc.join(", ") + "." :
      (g.on.length ? "Żaden operator nie daje go w cenie, ale możesz go dokupić." : "Żaden z operatorów nie sprzedaje tego serwisu.");

    this.$panel.innerHTML =
      '<p class="trtv-hint">Wybierz serwis, a pokażemy, u którego operatora jest w cenie, a u którego za dopłatą.</p>' +
      '<div class="trtv-svpick" role="group" aria-label="Serwis streamingowy">' + keys.map(function (k) {
        return '<button type="button" class="trtv-svbtn" data-svc="' + esc(k) + '" aria-pressed="' + (k === self.svc) + '">' + logo(k) + "<span>" + esc(groups[k].n) + "</span></button>";
      }).join("") + "</div>" +
      '<section class="trtv-svbox">' +
        '<div class="trtv-svhead">' + logo(this.svc, "trtv-slogo--lg") + '<div><h3 class="trtv-h3">' + esc(g.n) + '</h3><p class="trtv-svsum">' + esc(summary) + "</p></div></div>" +
        (g.on.length ? '<ul class="trtv-svlist">' + g.on.map(function (x) {
          var s = x.s, t = TYP[s.typ] || TYP.platny;
          var det = [s.wariant ? "<p><b>Warianty:</b> " + esc(s.wariant) + "</p>" : "", s.cena ? "<p><b>Ceny:</b> " + esc(s.cena) + "</p>" : "",
            s.zasady ? "<p><b>Zasady:</b> " + esc(s.zasady) + "</p>" : "",
            s.zrodlo ? '<p><a href="' + esc(s.zrodlo) + '" target="_blank" rel="noopener nofollow">Źródło: strona operatora</a></p>' : ""].join("");
          return '<li class="trtv-svrow trtv-svrow--' + t[2] + '">' +
            '<div class="trtv-svop">' + self.opLogo(x.o) + '<span class="trtv-badge trtv-badge--' + t[2] + '">' + t[1] + "</span></div>" +
            '<div class="trtv-svmain"><p class="trtv-svprice">' + esc(s.krotko || s.cena || "Cenę potwierdzi konsultant") + "</p>" +
              (s.uwaga ? '<p class="trtv-svnote">' + esc(s.uwaga) + "</p>" : "") +
              (det ? '<details class="trtv-svdet"><summary>Szczegóły i warunki</summary>' + det + "</details>" : "") +
            "</div></li>";
        }).join("") + "</ul>" : "") +
        (g.off.length ? '<p class="trtv-stoff">Nie ma w ofercie: ' + esc(g.off.join(", ")) + "</p>" : "") +
      "</section>";
    this.$panel.querySelectorAll("[data-svc]").forEach(function (b) {
      b.addEventListener("click", function () { self.svc = b.getAttribute("data-svc"); track("tv_streaming", { serwis: self.svc }); self.renderStreaming(); self.fixImgs(self.$panel); });
    });
    this.tone(this.$panel);
  };

  // Jasne logo (np. białe) dostaje ciemny kafelek, ciemne logo jasny.
  Widget.prototype.tone = function (scope) {
    scope.querySelectorAll(".trtv-slogo img").forEach(function (img) {
      function go() {
        try {
          var c = document.createElement("canvas"), w = c.width = 40, h = c.height = 20, x = c.getContext("2d");
          x.drawImage(img, 0, 0, w, h);
          var d = x.getImageData(0, 0, w, h).data, sum = 0, n = 0;
          for (var i = 0; i < d.length; i += 4) { if (d[i + 3] > 80) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } }
          if (n) img.parentNode.classList.add(sum / n > 170 ? "trtv-slogo--dark" : "trtv-slogo--light");
        } catch (e) { img.parentNode.classList.add("trtv-slogo--dark"); }
      }
      if (img.complete && img.naturalWidth) go(); else img.addEventListener("load", go, { once: true });
    });
  };

  // Multiroom i aplikacja: krótko, pełny opis po kliknięciu
  Widget.prototype.facts = function (o) {
    var m = o.multiroom || {}, a = o.aplikacja || {}, out = [];
    if (m.dostepny === false) out.push(["Multiroom", "niedostępny", ""]);
    else if (m.max || m.opis) out.push(["Multiroom", m.max ? "do " + m.max + " telewizorów" : "dostępny", m.opis]);
    if (a.nazwa) out.push(["Aplikacja", a.nazwa, a.urzadzenia]);
    if (!out.length) return "";
    return '<div class="trtv-facts">' + out.map(function (f) {
      return f[2] ? '<details><summary><b>' + esc(f[0]) + ":</b> " + esc(f[1]) + "</summary><p>" + esc(f[2]) + "</p></details>"
        : "<p><b>" + esc(f[0]) + ":</b> " + esc(f[1]) + "</p>";
    }).join("") + "</div>";
  };

  /* ---------- okno pakietu ---------- */
  Widget.prototype.openPkg = function (slug, lineId, pid, cat, only, q) {
    var self = this;
    var o = this.ops.filter(function (x) { return x.slug === slug; })[0]; if (!o) return;
    var L = o.linie.filter(function (x) { return x.id === lineId; })[0] || o.linie[0];
    var all = L.pakiety.concat(L.dodatki);
    var p = all.filter(function (x) { return x.id === pid; })[0] || L.pakiety[0];
    var isAdd = L.dodatki.indexOf(p) >= 0;
    var pi = L.pakiety.indexOf(p);
    var prev = pi > 0 ? L.pakiety[pi - 1] : null;
    var prevSet = {}; if (prev) prev.kanaly.forEach(function (k) { prevSet[k] = 1; });
    only = !!only && !!prev;
    var list = p.kanaly.filter(function (k) { return self.K[k] && (!only || !prevSet[k]); });
    var cats = {}; list.forEach(function (k) { var c = self.K[k].k; cats[c] = (cats[c] || 0) + 1; });
    var catList = (this.d.kategorie || []).filter(function (c) { return cats[c]; });
    var shown = list.filter(function (k) { return (!cat || self.K[k].k === cat) && (!q || fold(self.K[k].n).indexOf(fold(q)) >= 0); });
    shown.sort(function (a, b) {
      var ca = catList.indexOf(self.K[a].k), cb = catList.indexOf(self.K[b].k);
      return ca - cb || self.K[a].n.localeCompare(self.K[b].n, "pl");
    });
    var uid = this.uid();
    var grouped = "", lastCat = null;
    shown.forEach(function (k) {
      var c = self.K[k].k;
      if (c !== lastCat && !cat) { grouped += (lastCat !== null ? "</ul>" : "") + '<h4 class="trtv-cat">' + esc(c) + "</h4><ul class=\"trtv-grid\">"; lastCat = c; }
      else if (lastCat === null) { grouped += '<ul class="trtv-grid">'; lastCat = c; }
      var mine = self.sel.indexOf(k) >= 0;
      grouped += '<li class="trtv-t' + (mine ? " trtv-t--mine" : "") + '">' + self.logo(k) + '<span class="trtv-t-n">' + esc(self.K[k].n) + "</span>" +
        (self.K[k].q ? '<span class="trtv-q">' + esc(self.K[k].q) + "</span>" : "") + "</li>";
    });
    if (lastCat !== null) grouped += "</ul>";

    var tabs = '<div class="trtv-dlg-pk" role="group" aria-label="Pakiety">' + L.pakiety.map(function (x) {
      return '<button type="button" data-p="' + esc(x.id) + '" aria-pressed="' + (x === p) + '">' + esc(x.nazwa) + " <b>" + x.liczba + "</b></button>";
    }).join("") + "</div>" + (L.dodatki.length ? '<details class="trtv-dlg-add"' + (isAdd ? " open" : "") + '><summary>Pakiety dodatkowe</summary><div class="trtv-dlg-pk">' + L.dodatki.map(function (x) {
      return '<button type="button" data-p="' + esc(x.id) + '" aria-pressed="' + (x === p) + '">' + esc(x.nazwa) + "</button>";
    }).join("") + "</div></details>" : "");

    var body =
      '<div class="trtv-dlg-head">' + this.opLogo(o) + (o.linie.length > 1 ? '<span class="trtv-line">' + esc(L.nazwa) + "</span>" : "") +
        '<button type="button" class="trtv-dlg-x" aria-label="Zamknij"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      tabs +
      '<h3 class="trtv-dlg-t" id="trtv-dlg-t-' + uid + '">' + esc(p.nazwa) + '<span> ' + (isAdd ? list.length : p.liczba) + " " + plural(isAdd ? list.length : p.liczba, "kanał", "kanały", "kanałów") + "</span></h3>" +
      (isAdd && p.warunki ? '<p class="trtv-hint">' + esc(p.warunki) + "</p>" : "") +
      this.facts(o) +
      '<div class="trtv-dlg-tools">' +
        '<input type="search" class="trtv-input trtv-input--sm" placeholder="Szukaj w pakiecie" aria-label="Szukaj w pakiecie" value="' + esc(q || "") + '">' +
        (prev && !isAdd ? '<label class="trtv-only"><input type="checkbox"' + (only ? " checked" : "") + "> Tylko nowe względem " + esc(prev.nazwa) + "</label>" : "") +
      "</div>" +
      '<div class="trtv-cats" role="group" aria-label="Kategorie"><button type="button" data-c="" aria-pressed="' + !cat + '">Wszystkie <b>' + list.length + "</b></button>" +
        catList.map(function (c) { return '<button type="button" data-c="' + esc(c) + '" aria-pressed="' + (c === cat) + '">' + esc(c) + " <b>" + cats[c] + "</b></button>"; }).join("") + "</div>" +
      '<div class="trtv-dlg-list">' + (grouped || '<p class="trtv-hint">Brak kanałów dla tego filtra.</p>') + "</div>" +
      '<div class="trtv-dlg-foot"><span>Lista według ' + (o.zrodlo ? '<a href="' + esc(o.zrodlo) + '" target="_blank" rel="noopener nofollow">oficjalnej strony operatora</a>' : "operatora") + ", stan na " + esc(dataPL(o.stan_na)) + "</span>" +
        (this.cfg.cta ? '<a class="trtv-btn trtv-btn--cta trtv-cta" data-op="' + esc(o.slug) + '" href="' + esc(this.ctaHref(o)) + '">' + esc(this.cfg.ctaLabel) + "</a>" : "") + "</div>";

    var inner = this.$dlg.querySelector(".trtv-dlg-in");
    var keepFocus = document.activeElement && inner.contains(document.activeElement) && document.activeElement.type === "search";
    inner.innerHTML = body;
    this.fixImgs(inner);

    var st = { slug: slug, lineId: L.id, pid: p.id, cat: cat || "", only: only, q: q || "" };
    var rerender = function (ch) { var n = Object.assign({}, st, ch); self.openPkg(n.slug, n.lineId, n.pid, n.cat, n.only, n.q); };
    inner.querySelectorAll("[data-p]").forEach(function (b) { b.addEventListener("click", function () { rerender({ pid: b.getAttribute("data-p"), cat: "", only: false }); }); });
    inner.querySelectorAll("[data-c]").forEach(function (b) { b.addEventListener("click", function () { rerender({ cat: b.getAttribute("data-c") }); }); });
    var cb = inner.querySelector(".trtv-only input"); if (cb) cb.addEventListener("change", function () { rerender({ only: cb.checked, cat: "" }); });
    var si = inner.querySelector(".trtv-input--sm");
    si.addEventListener("input", function () { rerender({ q: si.value }); });
    if (keepFocus) { var ns = inner.querySelector(".trtv-input--sm"); ns.focus(); ns.setSelectionRange(ns.value.length, ns.value.length); }

    if (!this.$dlg.open) {
      if (this.$dlg.showModal) this.$dlg.showModal(); else this.$dlg.setAttribute("open", "");
      inner.querySelector(".trtv-dlg-x").focus();
      track("tv_pakiet", { operator: o.slug, pakiet: p.nazwa });
    }
  };

  /* ---------- start ---------- */
  function boot() {
    document.querySelectorAll(".trtv:not([data-ready])").forEach(function (el) {
      el.setAttribute("data-ready", "1");
      new Widget(el);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
