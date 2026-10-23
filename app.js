/* TeleRanking TV - baza wiedzy o telewizji u operatorów. Czysty JS, bez budowania. */
(function () {
  "use strict";

  const S = { ops: [], bySlug: {}, channels: new Map(), changelog: [], meta: {}, picked: [] };
  const app = document.getElementById("app");

  // ---------- pomocnicze ----------
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  // różne zapisy tego samego kanału u różnych operatorów -> jeden klucz
  const ALIAS = {
    tvnsiedem: "tvn7", tvn24biznesiswiat: "tvn24bis", telewizjarepublika: "republika", newsmaxpolska: "newsmax",
    wpolscepl: "wpolsce24", wpolsce24pl: "wpolsce24", wpolsce: "wpolsce24", discovery: "discoverychannel",
    hbo1: "hbo", cinemax1: "cinemax", nationalgeographicchannel: "nationalgeographic", scifi: "scifiuniversal",
    sundance: "sundancetv", e: "eentertainment", dwtv: "dw", dwenglish: "dw", dweng: "dw", deutschewelledw: "dw",
    france24ang: "france24en", france24english: "france24en", france24eng: "france24en",
    france24fra: "france24fr", france24french: "france24fr", france24franc: "france24fr",
    euronewspolski: "euronewspl", arirangtv: "arirang", studiomedtv: "studiomed", currenttimetv: "currenttime",
    belsattv: "belsat", espresotv: "espreso", ewtnpolska: "ewtn", dachatv: "dacha", "366tv": "366",
    ginxesportstv: "ginx", hustlertv: "hustler", redlighttv: "redlight", brazzerstv: "brazzers", brazzerstveurope: "brazzers",
    bloombergtelevision: "bloomberg", "canal+4kultra": "canal+4k", polsatviasatexplorer: "polsatviasatexplore",
    paramountnetworkpolska: "paramountnetwork", viasttruecrime: "viasattruecrime", mtv: "mtvpolska",
    funboxu: "funboxuhd", privatetv: "private",
  };
  const norm = (n) => {
    const k = String(n || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/ł/g, "l")
      .replace(/\b(fhd|hd|sd)\b/g, " ")
      .replace(/[^a-z0-9+]/g, "");
    return ALIAS[k] || k;
  };
  const yes = (v) => (v === true ? '<span class="ok">tak</span>' : v === false ? '<span class="no">nie</span>' : esc(v || "brak danych"));
  const qual = (q) => {
    q = String(q || "").toUpperCase();
    if (q.includes("4K") || q.includes("UHD")) return '<span class="tag k4">4K</span>';
    if (q.includes("HD")) return '<span class="tag hd">HD</span>';
    return q === "SD" ? '<span class="tag">SD</span>' : "";
  };
  const fetchJson = (u) => fetch(u + "?v=" + Date.now()).then((r) => (r.ok ? r.json() : Promise.reject(u)));

  // ---------- dane ----------
  async function load() {
    S.meta = await fetchJson("data/index.json");
    const res = await Promise.allSettled(S.meta.operatorzy.map((s) => fetchJson(`data/operators/${s}.json`)));
    res.forEach((r) => { if (r.status === "fulfilled") S.ops.push(r.value); });
    S.ops.forEach((o) => {
      S.bySlug[o.slug] = o;
      o._pak = {}; arr(o.pakiety).forEach((p, i) => { p._i = i; o._pak[p.id] = p; });
      o._dod = {}; arr(o.dodatki).forEach((d) => { o._dod[d.id] = d; });
      o._addonCh = {}; // znormalizowany kanał -> [id dodatku]
      arr(o.dodatki).forEach((d) => arr(d.kanaly).forEach((k) => { (o._addonCh[norm(k)] ||= []).push(d.id); }));
      arr(o.kanaly).forEach((k) => {
        const key = norm(k.nazwa); if (!key) return;
        const m = String(k.uwagi || "").match(/dodatek:\s*([\w.-]+)/gi);
        if (m) m.forEach((x) => { const id = x.split(":")[1].trim(); (o._addonCh[key] ||= []).includes(id) || o._addonCh[key].push(id); });
        let c = S.channels.get(key);
        if (!c) { c = { key, nazwa: k.nazwa, kategoria: k.kategoria || "inne", u: {} }; S.channels.set(key, c); }
        c.u[o.slug] = k;
      });
      // kanały występujące tylko w dodatkach
      Object.keys(o._addonCh).forEach((key) => {
        if (!S.channels.has(key)) {
          const d = o._dod[o._addonCh[key][0]];
          const nm = arr(d && d.kanaly).find((x) => norm(x) === key) || key;
          S.channels.set(key, { key, nazwa: nm, kategoria: "inne", u: {} });
        }
      });
    });
    try { S.changelog = await fetchJson("data/changelog.json"); } catch (e) { S.changelog = []; }
    document.getElementById("foot").innerHTML =
      `Dane: ${S.ops.length} operatorów, ${S.channels.size} kanałów. Ostatnia aktualizacja: ${esc(S.meta.aktualizacja || "-")}. ` +
      `Tylko do użytku wewnętrznego. Każda informacja ma źródło w karcie operatora.`;
  }

  // gdzie jest kanał u operatora: {pakiet, dodatki, k}
  function whereAt(o, key) {
    const k = arr(o.kanaly).find((x) => norm(x.nazwa) === key);
    const paks = k ? arr(k.pakiety).map((id) => o._pak[id]).filter(Boolean).sort((a, b) => a._i - b._i) : [];
    const adds = (o._addonCh[key] || []).map((id) => o._dod[id]).filter(Boolean);
    if (!k && !adds.length) return null;
    return { k, paks, adds };
  }

  // ---------- widoki ----------
  const views = {};

  views.kanaly = function () {
    const cats = [...new Set([...S.channels.values()].map((c) => c.kategoria))].sort();
    app.innerHTML = `
      <h1>Szukaj kanału</h1>
      <p class="lead">Wpisz nazwę kanału i zobacz, u którego operatora jest i od jakiego pakietu.</p>
      <input class="search" id="q" placeholder="np. Polsat Sport, Eleven, TVN24, Canal+…" autofocus>
      <div class="bar" id="cats"><button class="chip on" data-c="">wszystkie</button>${cats.map((c) => `<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      <div id="res"></div>`;
    let cat = "";
    const q = document.getElementById("q");
    const draw = () => {
      const t = norm(q.value);
      let list = [...S.channels.values()].filter((c) => (!t || c.key.includes(t) || norm(c.nazwa).includes(t)) && (!cat || c.kategoria === cat));
      list.sort((a, b) => Object.keys(b.u).length - Object.keys(a.u).length || a.nazwa.localeCompare(b.nazwa, "pl"));
      const total = list.length; list = list.slice(0, 60);
      document.getElementById("res").innerHTML =
        `<p class="muted small">${total} kanałów${total > 60 ? ", pokazuję 60 (zawęź wyszukiwanie)" : ""}</p>` +
        list.map(channelCard).join("");
    };
    q.addEventListener("input", draw);
    document.getElementById("cats").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      cat = b.dataset.c; document.querySelectorAll("#cats .chip").forEach((x) => x.classList.toggle("on", x === b)); draw();
    });
    draw();
  };

  function channelCard(c) {
    const rows = S.ops.map((o) => {
      const w = whereAt(o, c.key);
      if (!w) return `<div class="res-op none"><span>${esc(o.operator)}</span><span class="muted">brak</span></div>`;
      let txt = "";
      if (w.paks.length) txt = `od pakietu <b>${esc(w.paks[0].nazwa)}</b>` + (w.paks.length > 1 ? ` <span class="muted small">(też: ${w.paks.slice(1).map((p) => esc(p.nazwa)).join(", ")})</span>` : "");
      if (w.adds.length) txt += (txt ? "<br>" : "") + w.adds.map((d) => `<span class="tag add">dodatek</span> ${esc(d.nazwa)}`).join(", ");
      if (!txt) txt = '<span class="muted">jest na liście, bez przypisanego pakietu</span>';
      const note = w.k && w.k.uwagi && !/^dodatek:/i.test(w.k.uwagi) ? `<br><span class="muted small">${esc(w.k.uwagi)}</span>` : "";
      return `<div class="res-op"><a href="#/operator/${o.slug}">${esc(o.operator)}</a><span class="val">${qual(w.k && w.k.jakosc)} ${txt}${note}</span></div>`;
    }).join("");
    return `<div class="card"><div class="ch-head"><h3 style="margin:0">${esc(c.nazwa)}</h3><span class="chip">${esc(c.kategoria)}</span></div>${rows}</div>`;
  }

  views.dobierz = function () {
    app.innerHTML = `
      <h1>Dobierz pakiet do kanałów</h1>
      <p class="lead">Klient chce konkretne kanały? Dodaj je, a zobaczysz u każdego operatora najmniejszy pakiet (i ewentualne dodatki), który je zawiera.</p>
      <input class="search" id="q" placeholder="Dodaj kanał…">
      <div class="sugg" id="sg" hidden></div>
      <div class="pick" id="pk"></div>
      <div id="res"></div>`;
    const q = document.getElementById("q"), sg = document.getElementById("sg");
    q.addEventListener("input", () => {
      const t = norm(q.value);
      if (!t) { sg.hidden = true; return; }
      const list = [...S.channels.values()].filter((c) => c.key.includes(t) && !S.picked.includes(c.key)).slice(0, 12);
      sg.innerHTML = list.map((c) => `<div data-k="${esc(c.key)}">${esc(c.nazwa)} <span class="muted small">${Object.keys(c.u).length} oper.</span></div>`).join("") || '<div class="muted">brak</div>';
      sg.hidden = false;
    });
    sg.addEventListener("click", (e) => { const d = e.target.closest("[data-k]"); if (!d) return; S.picked.push(d.dataset.k); q.value = ""; sg.hidden = true; draw(); q.focus(); });
    document.getElementById("pk").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; S.picked = S.picked.filter((x) => x !== b.dataset.k); draw(); });
    const draw = () => {
      document.getElementById("pk").innerHTML = S.picked.map((k) => `<button class="chip on" data-k="${esc(k)}">${esc(S.channels.get(k).nazwa)} ✕</button>`).join("");
      if (!S.picked.length) { document.getElementById("res").innerHTML = ""; return; }
      document.getElementById("res").innerHTML = S.ops.map((o) => {
        const r = bestFor(o, S.picked);
        let body;
        if (!r) body = '<span class="muted">brak danych o pakietach</span>';
        else {
          body = `<b>${esc(r.pak.nazwa)}</b>` + (r.adds.length ? ` + ${r.adds.map((d) => `<span class="tag add">dodatek</span> ${esc(d.nazwa)}`).join(" + ")}` : "");
          const cond = r.adds.filter((d) => d.warunki).map((d) => `${esc(d.nazwa)}: ${esc(d.warunki)}`);
          if (cond.length) body += `<br><span class="muted small">Warunki dodatku: ${cond.join(" · ")}</span>`;
          if (r.missing.length) body += `<br><span class="no">Brak:</span> ${r.missing.map((k) => esc(S.channels.get(k).nazwa)).join(", ")}`;
        }
        return `<div class="card${r && !r.missing.length ? " best" : ""}"><div class="op-head"><h3><a href="#/operator/${o.slug}">${esc(o.operator)}</a></h3></div>${body}</div>`;
      }).join("");
    };
    draw();
  };

  function bestFor(o, keys) {
    const paks = arr(o.pakiety).filter((p) => !/premium|tematyczny/i.test(p.rodzaj || "")).sort((a, b) => a._i - b._i);
    const pool = paks.length ? paks : arr(o.pakiety);
    if (!pool.length) return null;
    let best = null;
    pool.forEach((p) => {
      const adds = new Set(), missing = [];
      keys.forEach((key) => {
        const k = arr(o.kanaly).find((x) => norm(x.nazwa) === key);
        if (k && arr(k.pakiety).includes(p.id)) return;
        const ad = (o._addonCh[key] || [])[0];
        if (ad && o._dod[ad]) adds.add(ad); else missing.push(key);
      });
      const score = missing.length * 100 + adds.size * 10 + p._i * 0.01;
      if (!best || score < best.score) best = { score, pak: p, adds: [...adds].map((id) => o._dod[id]), missing };
    });
    return best;
  }

  views.operatorzy = function () {
    app.innerHTML = `<h1>Operatorzy</h1><p class="lead">Ściągawka TV dla każdego operatora.</p><div class="grid">` +
      S.ops.map((o) => `<a class="card" style="text-decoration:none;color:inherit" href="#/operator/${o.slug}">
        <h3>${esc(o.operator)}</h3>
        <p class="small muted">${esc(o.podsumowanie || "")}</p>
        <span class="chip">${arr(o.pakiety).length} pakietów</span><span class="chip">${arr(o.kanaly).length} kanałów</span><span class="chip">${arr(o.dodatki).length} dodatków</span>
        <p class="small muted">Sprawdzono: ${esc(o.sprawdzono || "-")}</p></a>`).join("") + `</div>`;
  };

  views.operator = function (slug, tab) {
    const o = S.bySlug[slug];
    if (!o) { app.innerHTML = "<p>Nie ma takiego operatora.</p>"; return; }
    tab = tab || "przeglad";
    const tabs = [["przeglad", "Przegląd"], ["pakiety", "Pakiety i kanały"], ["dodatki", "Dodatki i streaming"], ["sprzet", "Multiroom i sprzęt"], ["faq", "Pytania klientów"], ["zrodla", "Źródła"]];
    const src = (ids) => {
      const list = arr(ids).map((id) => arr(o.zrodla).find((z) => z.id === id)).filter(Boolean);
      return list.length ? `<p class="small muted src">Źródło: ${list.map((z) => `<a href="${esc(z.url)}" target="_blank" rel="noopener">${esc(z.tytul)}</a>`).join(", ")}</p>` : "";
    };
    let body = "";
    if (tab === "przeglad") {
      body = `<div class="card"><p>${esc(o.podsumowanie)}</p></div>
        <h2>Technologie</h2>${arr(o.technologie).map((t) => `<div class="card"><h3>${esc(t.nazwa)}</h3><p>${esc(t.opis)}</p>${src(t.zrodla)}</div>`).join("") || '<p class="muted">brak danych</p>'}
        <h2>Warunki ogólne</h2><div class="card"><ul>${arr(o.warunki_ogolne).map((w) => `<li>${esc(w)}</li>`).join("") || "<li class='muted'>brak danych</li>"}</ul></div>
        ${arr(o.do_sprawdzenia).length ? `<h2>Do sprawdzenia</h2><div class="warn"><p class="small">Tych rzeczy nie udało się potwierdzić w oficjalnych źródłach. Nie podawaj ich klientowi jako pewnik.</p><ul>${arr(o.do_sprawdzenia).map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}`;
    } else if (tab === "pakiety") {
      body = arr(o.pakiety).map((p) => {
        const ch = arr(o.kanaly).filter((k) => arr(k.pakiety).includes(p.id));
        const byCat = {};
        ch.forEach((k) => (byCat[k.kategoria || "inne"] ||= []).push(k));
        return `<details ${arr(o.pakiety).length === 1 ? "open" : ""}><summary>${esc(p.nazwa)} <span class="chip">${esc(p.rodzaj || "")}</span><span class="chip">${p.liczba_kanalow ?? ch.length} kanałów${p.liczba_kanalow_hd ? `, ${p.liczba_kanalow_hd} HD` : ""}</span></summary>
          ${p.opis ? `<p>${esc(p.opis)}</p>` : ""}${p.zawiera_pakiet && o._pak[p.zawiera_pakiet] ? `<p class="small">Zawiera cały pakiet ${esc(o._pak[p.zawiera_pakiet].nazwa)}.</p>` : ""}
          ${p.warunki ? `<p class="small"><b>Warunki:</b> ${esc(p.warunki)}</p>` : ""}${src(p.zrodla)}
          ${Object.keys(byCat).sort().map((c) => `<h3 style="margin-top:12px">${esc(c)} <span class="muted small">(${byCat[c].length})</span></h3><ul class="cols">${byCat[c].sort((a, b) => a.nazwa.localeCompare(b.nazwa, "pl")).map((k) => `<li>${esc(k.nazwa)} ${qual(k.jakosc)}</li>`).join("")}</ul>`).join("") || '<p class="muted">Brak listy kanałów w danych.</p>'}
        </details>`;
      }).join("") || '<p class="muted">brak danych</p>';
    } else if (tab === "dodatki") {
      body = `<h2>Dodatki</h2>${arr(o.dodatki).map((d) => `<div class="card"><h3>${esc(d.nazwa)} <span class="chip">${esc(d.rodzaj || "")}</span></h3><p>${esc(d.zawartosc)}</p>${d.warunki ? `<p class="small"><b>Warunki:</b> ${esc(d.warunki)}</p>` : ""}${arr(d.kanaly).length ? `<p class="small">${arr(d.kanaly).map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</p>` : ""}${src(d.zrodla)}</div>`).join("") || '<p class="muted">brak danych</p>'}
        <h2>Streaming</h2><div class="tbl"><table><tr><th>Serwis</th><th>Dostępność</th><th>Opis</th></tr>${arr(o.streaming).map((s) => `<tr><td><b>${esc(s.serwis)}</b></td><td>${esc(s.dostepnosc)}</td><td>${esc(s.opis)}${src(s.zrodla)}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">brak danych</td></tr>'}</table></div>`;
    } else if (tab === "sprzet") {
      const m = o.multiroom || {}, s = o.sprzet_i_funkcje || {}, a = s.aplikacja || {};
      body = `<h2>Multiroom</h2><div class="card"><p><b>Dostępny:</b> ${yes(m.dostepny)}${m.max_odbiornikow ? ` &nbsp; <b>Maks. odbiorników:</b> ${esc(m.max_odbiornikow)}` : ""}</p>
          <p><b>Jak działa:</b> ${esc(m.jak_dziala || "brak danych")}</p><p><b>Co na kolejnych TV:</b> ${esc(m.co_na_kolejnych_tv || "brak danych")}</p>${m.uwagi ? `<p class="small">${esc(m.uwagi)}</p>` : ""}${src(m.zrodla)}</div>
        <h2>Sprzęt i funkcje</h2><div class="card">
          ${arr(s.dekodery).length ? `<p><b>Dekodery:</b></p><ul>${arr(s.dekodery).map((d) => `<li><b>${esc(d.nazwa)}</b> ${esc(d.opis)}</li>`).join("")}</ul>` : ""}
          <p><b>Aplikacja:</b> ${esc(a.nazwa || "brak danych")}${a.urzadzenia ? ` (${esc(a.urzadzenia)})` : ""}${a.ile_urzadzen_jednoczesnie ? `, jednocześnie: ${esc(a.ile_urzadzen_jednoczesnie)}` : ""}${a.uwagi ? `<br><span class="small">${esc(a.uwagi)}</span>` : ""}</p>
          <p><b>Smart TV bez dekodera:</b> ${esc(s.smart_tv_bez_dekodera || "brak danych")}</p>
          <p><b>Nagrywanie:</b> ${esc(s.nagrywanie || "brak danych")}</p>
          <p><b>Cofanie / od początku:</b> ${esc(s.cofanie_i_ogladanie_od_poczatku || "brak danych")}</p>
          <p><b>VOD:</b> ${esc(s.vod || "brak danych")}</p>${src(s.zrodla)}</div>`;
    } else if (tab === "faq") {
      body = arr(o.faq).map((f) => `<details><summary>${esc(f.pytanie)}</summary><p>${esc(f.odpowiedz)}</p>${src(f.zrodla)}</details>`).join("") || '<p class="muted">brak danych</p>';
    } else if (tab === "zrodla") {
      body = `<div class="card src"><ul>${arr(o.zrodla).map((z) => `<li><a href="${esc(z.url)}" target="_blank" rel="noopener">${esc(z.tytul)}</a> <span class="muted small">${esc(z.typ || "")}, sprawdzono ${esc(z.sprawdzono || o.sprawdzono || "")}</span></li>`).join("")}</ul></div>`;
    }
    app.innerHTML = `<div class="op-head"><div><h1>${esc(o.operator)}</h1><p class="muted small">Dane sprawdzone: ${esc(o.sprawdzono || "-")}</p></div><a href="#/operatorzy">← wszyscy operatorzy</a></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? "on" : ""}" onclick="location.hash='#/operator/${o.slug}/${k}'">${l}</button>`).join("")}</div>${body}`;
  };

  views.porownaj = function () {
    const maxCh = (o) => Math.max(0, ...arr(o.pakiety).map((p) => p.liczba_kanalow || arr(o.kanaly).filter((k) => arr(k.pakiety).includes(p.id)).length));
    const rows = [
      ["Technologie", (o) => arr(o.technologie).map((t) => esc(t.nazwa)).join(", ")],
      ["Pakiety", (o) => arr(o.pakiety).map((p) => esc(p.nazwa)).join(", ")],
      ["Najwięcej kanałów w pakiecie", (o) => maxCh(o) || "-"],
      ["Multiroom", (o) => `${yes(o.multiroom && o.multiroom.dostepny)}${o.multiroom && o.multiroom.max_odbiornikow ? `, do ${esc(o.multiroom.max_odbiornikow)}` : ""}`],
      ["Aplikacja", (o) => esc((o.sprzet_i_funkcje && o.sprzet_i_funkcje.aplikacja && o.sprzet_i_funkcje.aplikacja.nazwa) || "-")],
      ["Smart TV bez dekodera", (o) => esc((o.sprzet_i_funkcje || {}).smart_tv_bez_dekodera || "-")],
      ["Nagrywanie", (o) => esc((o.sprzet_i_funkcje || {}).nagrywanie || "-")],
      ["Cofanie / od początku", (o) => esc((o.sprzet_i_funkcje || {}).cofanie_i_ogladanie_od_poczatku || "-")],
      ["Streaming", (o) => arr(o.streaming).filter((s) => !/^brak/i.test(s.dostepnosc || "")).map((s) => `<span class="chip" title="${esc(s.dostepnosc)}">${esc(s.serwis)}</span>`).join("") || "-"],
      ["Dodatki premium", (o) => arr(o.dodatki).map((d) => `<span class="chip">${esc(d.nazwa)}</span>`).join("") || "-"],
    ];
    app.innerHTML = `<h1>Porównanie operatorów</h1><p class="lead">Najważniejsze cechy obok siebie. Szczegóły i źródła w kartach operatorów.</p>
      <div class="tbl"><table><tr><th></th>${S.ops.map((o) => `<th><a style="color:#fff" href="#/operator/${o.slug}">${esc(o.operator)}</a></th>`).join("")}</tr>
      ${rows.map(([l, f]) => `<tr><td><b>${l}</b></td>${S.ops.map((o) => `<td>${f(o)}</td>`).join("")}</tr>`).join("")}</table></div>`;
  };

  views.faq = function () {
    app.innerHTML = `<h1>Pytania klientów</h1><p class="lead">Gotowe odpowiedzi na pytania o telewizję u każdego operatora.</p>
      <input class="search" id="q" placeholder="np. multiroom, Netflix, nagrywanie, Smart TV…">
      <div class="bar" id="ops"><button class="chip on" data-s="">wszyscy</button>${S.ops.map((o) => `<button class="chip" data-s="${o.slug}">${esc(o.operator)}</button>`).join("")}</div><div id="res"></div>`;
    let op = "";
    const q = document.getElementById("q");
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      document.getElementById("res").innerHTML = S.ops.filter((o) => !op || o.slug === op).map((o) => {
        const list = arr(o.faq).filter((f) => !t || (f.pytanie + " " + f.odpowiedz).toLowerCase().includes(t));
        return list.length ? `<h2>${esc(o.operator)}</h2>` + list.map((f) => `<details><summary>${esc(f.pytanie)}</summary><p>${esc(f.odpowiedz)}</p></details>`).join("") : "";
      }).join("") || '<p class="muted">Nic nie znaleziono.</p>';
    };
    q.addEventListener("input", draw);
    document.getElementById("ops").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; op = b.dataset.s; document.querySelectorAll("#ops .chip").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
    draw();
  };

  views.zmiany = function () {
    app.innerHTML = `<h1>Historia zmian</h1><p class="lead">Co zmieniło się w ofertach TV przy cotygodniowych aktualizacjach.</p>` +
      (arr(S.changelog).map((w) => `<div class="card"><h3>${esc(w.data)}</h3>${arr(w.operatorzy).map((x) => `<p><b>${esc(x.operator)}:</b></p><ul>${arr(x.zmiany).map((z) => `<li>${esc(z)}</li>`).join("")}</ul>`).join("") || '<p class="muted">Bez zmian.</p>'}</div>`).join("") || '<p class="muted">Brak wpisów.</p>');
  };

  // ---------- routing ----------
  function route() {
    const parts = (location.hash.replace(/^#\/?/, "") || "kanaly").split("/");
    const v = parts[0];
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.v === v || (v === "operator" && a.dataset.v === "operatorzy")));
    (views[v] || views.kanaly)(parts[1], parts[2]);
    window.scrollTo(0, 0);
  }

  load().then(() => { window.addEventListener("hashchange", route); route(); })
    .catch((e) => { app.innerHTML = `<div class="warn">Nie udało się wczytać danych (${esc(e)}).</div>`; });
})();
