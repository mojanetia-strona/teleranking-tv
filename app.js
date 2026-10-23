/* TeleRanking TV - prosta ściągawka: kanały w pakietach, wyszukiwarka kanału, streaming. */
(function () {
  "use strict";

  const S = { ops: [], bySlug: {}, channels: new Map(), logos: {}, changelog: [], meta: {} };
  const app = document.getElementById("app");

  // ---------- pomocnicze ----------
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const ALIAS = {
    tvnsiedem: "tvn7", tvn24biznesiswiat: "tvn24bis", telewizjarepublika: "republika", tvrepublika: "republika", newsmaxpolska: "newsmax",
    wpolscepl: "wpolsce24", wpolsce24pl: "wpolsce24", wpolsce: "wpolsce24", discovery: "discoverychannel",
    hbo1: "hbo", cinemax1: "cinemax", nationalgeographicchannel: "nationalgeographic", scifi: "scifiuniversal",
    sundance: "sundancetv", e: "eentertainment", dwtv: "dw", dwenglish: "dw", dweng: "dw", deutschewelledw: "dw",
    france24ang: "france24en", france24english: "france24en", france24eng: "france24en",
    france24fra: "france24fr", france24french: "france24fr", france24franc: "france24fr", france24francais: "france24fr",
    euronewspolski: "euronewspl", arirangtv: "arirang", studiomedtv: "studiomed", currenttimetv: "currenttime",
    belsattv: "belsat", espresotv: "espreso", ewtnpolska: "ewtn", dachatv: "dacha", "366tv": "366",
    ginxesportstv: "ginx", hustlertv: "hustler", redlighttv: "redlight", brazzerstv: "brazzers", brazzerstveurope: "brazzers",
    bloombergtelevision: "bloomberg", "canal+4kultra": "canal+4k", polsatviasatexplorer: "polsatviasatexplore",
    paramountnetworkpolska: "paramountnetwork", viasttruecrime: "viasattruecrime", mtv: "mtvpolska",
    funboxu: "funboxuhd", privatetv: "private", id: "idinvestigationdiscovery", natgeowild: "nationalgeographicwild",
    tvtrwam: "trwam", eurosport: "eurosport1", zoomtv: "zoom", fokustv: "fokus", crimeinvestigationpolsat: "polsatcrimeinvestigation",
  };
  const norm = (n) => {
    const k = String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l")
      .replace(/\b(fhd|hd|sd)\b/g, " ").replace(/[^a-z0-9+]/g, "");
    return ALIAS[k] || k;
  };
  const qual = (q) => {
    q = String(q || "").toUpperCase();
    if (q.includes("4K") || q.includes("UHD")) return '<span class="tag k4">4K</span>';
    if (q.includes("HD")) return '<span class="tag hd">HD</span>';
    return "";
  };
  const initials = (n) => String(n || "?").replace(/[^A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż+ ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "TV";
  const logo = (name) => {
    const u = S.logos[norm(name)];
    const ini = esc(initials(name));
    return u ? `<span class="lg"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-i="${ini}" onerror="this.outerHTML='<span class=lg-fb>'+this.dataset.i+'</span>'"></span>`
      : `<span class="lg"><span class="lg-fb">${ini}</span></span>`;
  };
  const fetchJson = (u) => fetch(u + "?v=" + Date.now()).then((r) => (r.ok ? r.json() : Promise.reject(u)));

  // ---------- dane ----------
  async function load() {
    S.meta = await fetchJson("data/index.json");
    const res = await Promise.allSettled(S.meta.operatorzy.map((s) => fetchJson(`data/operators/${s}.json`)));
    res.forEach((r) => { if (r.status === "fulfilled") S.ops.push(r.value); });
    try {
      const raw = await fetchJson("data/logos.json");
      Object.entries(raw).forEach(([k, v]) => { const n = norm(k); if (n && !S.logos[n]) S.logos[n] = v; });
    } catch (e) { /* bez logotypów */ }
    try { S.changelog = await fetchJson("data/changelog.json"); } catch (e) { S.changelog = []; }
    S.svLogos = {};
    try { const sl = await fetchJson("data/streaming-logos.json"); Object.entries(sl).forEach(([k, v]) => { S.svLogos[svKey(k)] = v; }); } catch (e) { /* bez logotypów */ }
    S.ops.forEach((o) => {
      S.bySlug[o.slug] = o;
      o._pak = {}; arr(o.pakiety).forEach((p, i) => { p._i = i; o._pak[p.id] = p; });
      o._dod = {}; arr(o.dodatki).forEach((d) => { o._dod[d.id] = d; });
      o._addonCh = {};
      arr(o.dodatki).forEach((d) => arr(d.kanaly).forEach((k) => { const key = norm(k); (o._addonCh[key] ||= []).includes(d.id) || o._addonCh[key].push(d.id); }));
      arr(o.kanaly).forEach((k) => {
        const key = norm(k.nazwa); if (!key) return;
        (String(k.uwagi || "").match(/dodatek:\s*([\w.-]+)/gi) || []).forEach((x) => { const id = x.split(":")[1].trim(); (o._addonCh[key] ||= []).includes(id) || o._addonCh[key].push(id); });
        if (!S.channels.has(key)) S.channels.set(key, { key, nazwa: k.nazwa, kategoria: k.kategoria || "inne" });
      });
      Object.keys(o._addonCh).forEach((key) => {
        if (!S.channels.has(key)) {
          const d = o._dod[o._addonCh[key][0]];
          S.channels.set(key, { key, nazwa: arr(d && d.kanaly).find((x) => norm(x) === key) || key, kategoria: "inne" });
        }
      });
    });
    document.getElementById("foot").innerHTML =
      `Dane z oficjalnych stron operatorów, aktualizowane co tydzień. Ostatnio: ${esc(S.meta.aktualizacja || "-")} · <a href="#/zmiany">historia zmian</a>`;
  }

  // kanały w pakiecie lub dodatku
  function channelsOf(o, id) {
    if (o._pak[id]) return arr(o.kanaly).filter((k) => arr(k.pakiety).includes(id));
    const d = o._dod[id]; if (!d) return [];
    const keys = new Set(arr(d.kanaly).map(norm));
    arr(o.kanaly).forEach((k) => { if ((o._addonCh[norm(k.nazwa)] || []).includes(id)) keys.add(norm(k.nazwa)); });
    return [...keys].map((key) => arr(o.kanaly).find((k) => norm(k.nazwa) === key) || { nazwa: S.channels.get(key)?.nazwa || key, kategoria: "inne" });
  }

  const opPills = (cur, href) => `<div class="ops">${S.ops.map((o) => `<a class="op${o.slug === cur ? " on" : ""}" href="${href(o)}">${esc(o.operator)}</a>`).join("")}</div>`;

  // ---------- widok: pakiety ----------
  function viewPakiety(slug, pid) {
    const o = S.bySlug[slug] || S.ops[0];
    if (!o) { app.innerHTML = "<p>Brak danych.</p>"; return; }
    const paks = arr(o.pakiety), dods = arr(o.dodatki);
    if (!pid || (!o._pak[pid] && !o._dod[pid])) pid = (paks[0] || dods[0] || {}).id;
    const cur = o._pak[pid] || o._dod[pid] || {};
    const isAdd = !!o._dod[pid];
    const list = channelsOf(o, pid).slice().sort((a, b) => a.nazwa.localeCompare(b.nazwa, "pl"));
    const href = (id) => `#/pakiety/${o.slug}/${encodeURIComponent(id)}`;
    const count = cur.liczba_kanalow || list.length;
    const m = o.multiroom || {}, f = o.sprzet_i_funkcje || {}, a = f.aplikacja || {};
    app.innerHTML = `
      ${opPills(o.slug, (x) => `#/pakiety/${x.slug}`)}
      <div class="pk-row"><span class="pk-lbl">Pakiety</span>${paks.map((p) => `<a class="pk${p.id === pid ? " on" : ""}" href="${href(p.id)}">${esc(p.nazwa)}</a>`).join("")}</div>
      ${dods.length ? `<div class="pk-row"><span class="pk-lbl">Dodatki</span>${dods.map((d) => `<a class="pk add${d.id === pid ? " on" : ""}" href="${href(d.id)}">${esc(d.nazwa)}</a>`).join("")}</div>` : ""}
      <div class="pk-head">
        <div><h1>${esc(cur.nazwa || "")}</h1>
          <p class="lead">${count} kanałów${cur.zawiera_pakiet && o._pak[cur.zawiera_pakiet] ? ` · zawiera cały ${esc(o._pak[cur.zawiera_pakiet].nazwa)}` : ""}${isAdd && cur.warunki ? ` · ${esc(cur.warunki)}` : ""}</p></div>
        <input class="search sm" id="q" placeholder="Szukaj w tym pakiecie…">
      </div>
      <div class="tiles" id="tiles"></div>
      <div class="facts" onclick="var d=event.target.closest('.facts > div');if(d)d.classList.toggle('open')">
        <div><b>Multiroom</b><span>${m.dostepny === false ? "niedostępny" : esc([m.max_odbiornikow ? `do ${m.max_odbiornikow} TV` : "", m.jak_dziala].filter(Boolean).join(", ") || "brak danych")}</span></div>
        <div><b>Aplikacja</b><span>${esc([a.nazwa, a.urzadzenia].filter(Boolean).join(": ") || "brak danych")}</span></div>
        <div><b>Nagrywanie i cofanie</b><span>${esc([f.nagrywanie, f.cofanie_i_ogladanie_od_poczatku].filter(Boolean).join(" · ") || "brak danych")}</span></div>
      </div>`;
    const q = document.getElementById("q");
    const draw = () => {
      const t = norm(q.value);
      const l = list.filter((k) => !t || norm(k.nazwa).includes(t));
      document.getElementById("tiles").innerHTML = l.map((k) =>
        `<div class="tile">${logo(k.nazwa)}<div class="tn"><span>${esc(k.nazwa)}</span>${qual(k.jakosc)}</div></div>`).join("")
        || `<p class="muted">${list.length ? "Nie ma takiego kanału w tym pakiecie." : "Brak listy kanałów w danych."}</p>`;
    };
    q.addEventListener("input", draw);
    draw();
  }

  // ---------- widok: szukaj kanału ----------
  function where(o, key) {
    const k = arr(o.kanaly).find((x) => norm(x.nazwa) === key);
    const paks = k ? arr(k.pakiety).map((id) => o._pak[id]).filter(Boolean).sort((a, b) => a._i - b._i) : [];
    const adds = (o._addonCh[key] || []).map((id) => o._dod[id]).filter(Boolean);
    return { k, paks, adds };
  }

  function viewSzukaj() {
    app.innerHTML = `
      <h1>Czy jest kanał?</h1>
      <p class="lead">Wpisz kanał, a zobaczysz, u którego operatora jest i od jakiego pakietu.</p>
      <input class="search" id="q" placeholder="np. Polsat Sport, Eleven, TVN 24, Canal+…" autofocus>
      <div id="res"></div>`;
    const q = document.getElementById("q");
    const draw = () => {
      const t = norm(q.value);
      if (!t) { document.getElementById("res").innerHTML = '<p class="muted hint">Zacznij pisać nazwę kanału.</p>'; return; }
      const list = [...S.channels.values()].filter((c) => c.key.includes(t) || norm(c.nazwa).includes(t))
        .sort((a, b) => (a.key.startsWith(t) ? 0 : 1) - (b.key.startsWith(t) ? 0 : 1) || a.nazwa.localeCompare(b.nazwa, "pl")).slice(0, 25);
      document.getElementById("res").innerHTML = list.map((c) => `
        <div class="card ch">
          <div class="ch-head">${logo(c.nazwa)}<h3>${esc(c.nazwa)}</h3></div>
          ${S.ops.map((o) => {
            const w = where(o, c.key);
            let v;
            if (w.paks.length) v = `od pakietu <b>${esc(w.paks[0].nazwa)}</b>`;
            else if (w.adds.length) v = `<span class="tag add">dodatek</span> <b>${esc(w.adds[0].nazwa)}</b>`;
            else return `<div class="row none"><span>${esc(o.operator)}</span><span>brak</span></div>`;
            if (w.paks.length && w.adds.length) v += ` <span class="muted small">lub dodatek ${esc(w.adds[0].nazwa)}</span>`;
            return `<div class="row"><a href="#/pakiety/${o.slug}/${encodeURIComponent((w.paks[0] || w.adds[0]).id)}">${esc(o.operator)}</a><span>${v} ${qual(w.k && w.k.jakosc)}</span></div>`;
          }).join("")}
        </div>`).join("") || '<p class="muted hint">Nie znaleziono takiego kanału u żadnego operatora.</p>';
    };
    q.addEventListener("input", draw);
    draw();
  }

  // ---------- widok: streaming ----------
  const SV = { "max": "hbomax", "hbomaxzhbo": "hbomax", "canal+online": "canal+", "canal+": "canal+", "primevideo": "amazonprimevideo", "amazonprime": "amazonprimevideo", "disney": "disney+", "elevensports": "eleven" };
  const svKey = (s) => { const k = String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)/g, "").replace(/[^a-z0-9+]/g, ""); return SV[k] || k; };
  const ORDER = ["netflix", "hbomax", "disney+", "skyshowtime", "amazonprimevideo", "canal+", "polsatboxgo", "player", "eleven", "viaplay"];

  const nmOf = (s) => (/^inny$/i.test(String(s.serwis || "").trim()) && s.wariant ? s.wariant : s.serwis);
  function viewStreaming(slug) {
    const groups = new Map();
    S.ops.forEach((o) => arr(o.streaming).forEach((s) => {
      const nm = /^inny$/i.test(String(s.serwis || "").trim()) && s.wariant ? s.wariant : s.serwis;
      const k = svKey(nm); if (!k) return;
      if (!groups.has(k)) groups.set(k, { nazwa: nm, items: [] });
      groups.get(k).items.push({ o, s });
    }));
    const keys = [...groups.keys()].sort((a, b) => ((ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99)) || a.localeCompare(b));
    const pills = `<div class="ops"><a class="op${!slug ? " on" : ""}" href="#/streaming">Wszyscy</a>${S.ops.map((o) => `<a class="op${o.slug === slug ? " on" : ""}" href="#/streaming/${o.slug}">${esc(o.operator)}</a>`).join("")}</div>`;
    const src = (o, ids) => arr(ids).map((id) => arr(o.zrodla).find((z) => z.id === id)).filter(Boolean).slice(0, 2)
      .map((z) => `<a href="${esc(z.url)}" target="_blank" rel="noopener">źródło</a>`).join(" · ");
    app.innerHTML = `<h1>Streaming</h1><p class="lead">Co który operator daje z serwisów streamingowych, za ile i na jakich zasadach.</p>${pills}` +
      keys.map((k) => {
        const g = groups.get(k);
        const items = g.items.filter((x) => !slug || x.o.slug === slug);
        if (!items.length) return "";
        const lu = S.svLogos[k];
        return `<div class="card sv"><div class="sv-head"><span class="sv-lg">${lu ? `<img src="${esc(lu)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span><h3>${esc(g.nazwa)}</h3></div>${items.map(({ o, s }) => {
          const none = /^brak/i.test(s.dostepnosc || "");
          return `<div class="sv-row${none ? " none" : ""}">
            <div class="sv-op">${esc(o.operator)}</div>
            <div class="sv-body">
              ${none ? '<span class="muted">nie ma w ofercie</span>' : `<div class="sv-price">${esc(s.cena || "cena do sprawdzenia")}</div>`}
              ${s.wariant && s.wariant !== nmOf(s) ? `<div class="small"><b>Wariant:</b> ${esc(s.wariant)}</div>` : ""}
              ${!none && s.dostepnosc ? `<div class="small muted">${esc(s.dostepnosc)}</div>` : ""}
              ${s.zasady && !none ? `<details class="rules"><summary>Zasady i warunki</summary><p class="small">${esc(s.zasady)}</p><div class="small muted">${src(o, s.zrodla)}</div></details>` : ""}
              ${none && s.zasady ? `<div class="small muted">${esc(s.zasady)}</div>` : ""}
            </div></div>`;
        }).join("")}</div>`;
      }).join("");
  }

  function viewZmiany() {
    app.innerHTML = `<h1>Historia zmian</h1><p class="lead">Co zmieniło się w ofertach TV przy cotygodniowych aktualizacjach.</p>` +
      (arr(S.changelog).map((w) => `<div class="card"><h3>${esc(w.data)}</h3>${arr(w.operatorzy).map((x) => `<p><b>${esc(x.operator)}:</b></p><ul>${arr(x.zmiany).map((z) => `<li>${esc(z)}</li>`).join("")}</ul>`).join("") || '<p class="muted">Bez zmian.</p>'}</div>`).join("") || '<p class="muted">Brak wpisów.</p>');
  }

  // ---------- routing ----------
  function route() {
    const p = (location.hash.replace(/^#\/?/, "") || "pakiety").split("/").map(decodeURIComponent);
    const v = p[0];
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.v === v));
    if (v === "szukaj") viewSzukaj();
    else if (v === "streaming") viewStreaming(p[1]);
    else if (v === "zmiany") viewZmiany();
    else viewPakiety(p[1], p[2]);
    window.scrollTo(0, 0);
  }

  load().then(() => { window.addEventListener("hashchange", route); route(); })
    .catch((e) => { app.innerHTML = `<div class="warn">Nie udało się wczytać danych (${esc(e)}).</div>`; });
})();
