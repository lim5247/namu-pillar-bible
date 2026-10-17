/* 나무필라 바이블 챔피언십 – 화면 동작 */
(() => {
  "use strict";
  const API = (window.API_URL || "").trim();
  const GAME_LABEL = "나무필라 연습게임";

  /* ---------- 작은 도구들 ---------- */
  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmt = ms => { const s = Math.round(ms / 1000); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  const pct = (s, t) => Math.round(s / t * 100);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  /* ---------- 서버 ---------- */
  async function apiGet(params) {
    const r = await fetch(API + "?" + new URLSearchParams(params));
    return r.json();
  }
  async function apiPost(body) {
    const r = await fetch(API, { method: "POST", body: JSON.stringify(body) });
    return r.json();
  }

  /* ---------- 문제 ---------- */
  const QMAP = new Map();
  const mk = ([id, q, a, w, ref], unit) => ({ id, q, a, w, ref, unit });
  Object.entries(QUESTIONS).forEach(([u, list]) => list.forEach(r => QMAP.set(r[0], mk(r, +u))));
  VERSE_QUESTIONS.forEach(r => QMAP.set(r[0], mk(r, "verse")));
  const ALLBOOKS = [...BOOKS.ot.map(b => [b[0], b[1], "구약"]), ...BOOKS.nt.map(b => [b[0], b[1], "신약"])];
  function abbrQ(id) {
    const m = id.match(/^ab-([na])-(.+)$/); if (!m) return null;
    const b = ALLBOOKS.find(x => x[0] === m[2]); if (!b) return null;
    const same = shuffle(ALLBOOKS.filter(x => x[2] === b[2] && x[0] !== b[0])).slice(0, 3);
    return m[1] === "n"
      ? { id, q: `성경 약어 '${b[0]}'는 어떤 책인가요?`, a: b[1], w: same.map(x => x[1]), ref: b[2] + " 성경", unit: "abbr" }
      : { id, q: `'${b[1]}'의 약어는?`, a: b[0], w: same.map(x => x[0]), ref: b[2] + " 성경", unit: "abbr" };
  }
  const getQ = id => id.startsWith("ab-") ? abbrQ(id) : QMAP.get(id);
  const unitOf = n => UNITS.find(u => u.no === n);

  /* ---------- 사용자 ---------- */
  let user = store.get("np-user", null);
  let roster = null;
  const keyFor = k => "np-" + k + ":" + (user ? (user.guest ? "손님 " : "") + user.name : "-");
  const myHist = () => store.get(keyFor("hist"), []);
  const myWrong = () => store.get(keyFor("wrong"), {});
  const rankName = () => user ? (user.guest ? "손님 " + user.name : user.name) : "";
  let serverHist = null;

  function setUser(u) {
    user = u; store.set("np-user", u); serverHist = null;
    $("#who-btn").textContent = u ? (u.guest ? "손님 " : "") + u.name + " 님" : "이름 고르기";
    renderWrong(); renderUnit(curUnit); renderGameNote(); loadServerHist(); flush();
  }

  /* ---------- 이름 고르기 ---------- */
  let pending = null, picked = null;
  function openOverlay(id) { $(id).hidden = false; document.body.style.overflow = "hidden"; }
  function closeOverlay(id) { $(id).hidden = true; if ($("#login").hidden && $("#runner").hidden) document.body.style.overflow = ""; }

  async function openLogin(then) {
    pending = then || null;
    showStep("name");
    openOverlay("#login");
    renderMembers();
    if (API && !roster) {
      try { const r = await apiGet({ action: "roster" }); if (r.ok) { roster = r.members; renderMembers(); } } catch {}
    }
  }
  function showStep(s) { ["name", "pin", "guest"].forEach(n => $("#step-" + n).hidden = n !== s); }
  function renderMembers() {
    const box = $("#members"); box.replaceChildren();
    const names = roster ? roster.map(m => m.name) : MEMBERS;
    names.forEach(n => {
      const b = el("button", null, n); b.type = "button";
      b.setAttribute("aria-pressed", String(!!user && !user.guest && user.name === n));
      b.addEventListener("click", () => pickMember(n));
      box.append(b);
    });
    const g = el("button", "guest", "손님이에요"); g.type = "button";
    g.addEventListener("click", () => { showStep("guest"); $("#guest-msg").textContent = ""; $("#guest-name").focus(); });
    box.append(g);
  }
  function pickMember(name) {
    picked = name;
    if (!API) { finishLogin({ name, token: null }); return; }
    const info = roster && roster.find(m => m.name === name);
    const first = info ? !info.hasPin : false;
    $("#pin-title").textContent = name + " 님" + (first ? ", 처음이네요!" : "");
    $("#pin-help").textContent = first
      ? "앞으로 쓸 숫자 4자리를 정해주세요. 다른 기기에서 들어올 때 필요해요."
      : "내가 정한 숫자 4자리를 입력하세요. 잊었다면 필라장에게 말해주세요.";
    $("#pin1-label").textContent = first ? "새 숫자 4자리" : "숫자 4자리";
    $("#pin2-wrap").hidden = !first;
    $("#pin1").value = ""; $("#pin2").value = ""; $("#pin-msg").textContent = ""; $("#pin-msg").className = "msg";
    showStep("pin"); $("#pin1").focus();
  }
  async function submitPin() {
    const p1 = $("#pin1").value.trim(), p2 = $("#pin2").value.trim(), msg = $("#pin-msg");
    msg.className = "msg bad";
    if (!/^\d{4}$/.test(p1)) { msg.textContent = "숫자 4자리를 입력하세요."; return; }
    if (!$("#pin2-wrap").hidden && p1 !== p2) { msg.textContent = "두 번 입력한 숫자가 달라요."; return; }
    msg.className = "msg"; msg.textContent = "확인하는 중…"; $("#pin-ok").disabled = true;
    try {
      const r = await apiPost({ action: "login", name: picked, pin: p1 });
      if (r.ok) {
        if (roster) roster = roster.map(m => m.name === picked ? { ...m, hasPin: true } : m);
        finishLogin({ name: picked, token: r.token });
      } else { msg.className = "msg bad"; msg.textContent = r.error; }
    } catch { msg.className = "msg bad"; msg.textContent = "인터넷 연결을 확인하고 다시 눌러주세요."; }
    $("#pin-ok").disabled = false;
  }
  function finishLogin(u) {
    setUser(u); closeOverlay("#login");
    const then = pending; pending = null;
    if (then) then();
  }
  $("#pin-ok").addEventListener("click", submitPin);
  ["#pin1", "#pin2"].forEach(s => $(s).addEventListener("keydown", e => { if (e.key === "Enter") submitPin(); }));
  $("#pin-back").addEventListener("click", () => showStep("name"));
  $("#guest-back").addEventListener("click", () => showStep("name"));
  $("#guest-ok").addEventListener("click", () => {
    const n = $("#guest-name").value.trim().replace(/^손님\s*/, "");
    if (!n) { $("#guest-msg").className = "msg bad"; $("#guest-msg").textContent = "이름을 적어주세요."; return; }
    finishLogin({ name: n, guest: true, token: null });
  });
  $("#guest-name").addEventListener("keydown", e => { if (e.key === "Enter") $("#guest-ok").click(); });
  $("#login-close").addEventListener("click", () => { pending = null; closeOverlay("#login"); });
  $("#who-btn").addEventListener("click", () => openLogin());
  const requireUser = fn => user ? fn() : openLogin(fn);

  /* ---------- 탭 ---------- */
  const TABS = ["game", "unit", "memo", "wrong"];
  function showTab(t) {
    if (!TABS.includes(t)) t = "game";
    TABS.forEach(n => { $("#" + n).hidden = n !== t; $("#tab-" + n).setAttribute("aria-selected", String(n === t)); });
    store.set("np-tab", t);
    if (t === "unit") renderUnit(curUnit);
    if (t === "wrong") renderWrong();
    if (t === "game") loadRanking();
  }
  document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => { showTab(b.dataset.tab); window.scrollTo({ top: 0 }); }));

  /* ---------- 단원 공부 ---------- */
  let curUnit = store.get("np-unit", 1);
  function verseBox(v) {
    const d = el("div", "verse");
    const r = el("div", "ref"); r.append(el("strong", null, v.ref), el("span", null, v.scene));
    const q = el("q", null, v.text); q.addEventListener("click", () => q.classList.toggle("peek"));
    d.append(r, q); return d;
  }
  UNITS.forEach(u => {
    const b = el("button"); b.type = "button";
    b.append(el("span", "n", u.no + " "), document.createTextNode(u.title));
    b.addEventListener("click", () => { curUnit = u.no; store.set("np-unit", u.no); renderUnit(u.no); });
    b.dataset.no = u.no; $("#unit-pills").append(b);
  });
  function renderUnit(n) {
    const u = unitOf(n) || UNITS[0];
    document.querySelectorAll("#unit-pills button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.no === u.no)));
    $("#u-range").textContent = `Unit ${u.no} · ${u.range}`;
    $("#u-title").textContent = u.no + "단원 " + u.title;
    $("#u-lead").textContent = u.lead;
    $("#u-keys").replaceChildren(...u.keys.map(k => el("span", "chip", k)));
    const vs = VERSES.filter(v => v.unit === u.no);
    $("#u-verse-card").hidden = !vs.length;
    $("#u-verses").replaceChildren(...vs.map(verseBox));
    $("#u-scenes").replaceChildren(...u.scenes.map(([ch, t, txt]) => {
      const li = el("li"); const body = el("div");
      body.append(el("b", null, t), el("span", null, txt));
      li.append(el("span", "ch", ch), body); return li;
    }));
    const chs = [];
    for (let c = u.from; c <= u.to; c++) {
      const a = el("a", null, (u.book === "gen" ? "창 " : "출 ") + c);
      a.href = `https://www.bskorea.or.kr/bible/korbibReadpage.php?version=GAE&book=${u.book}&chap=${c}`;
      a.target = "_blank"; a.rel = "noopener";
      chs.push(a);
    }
    $("#u-chapters").replaceChildren(...chs);
    renderChart(u);
  }
  $("#go-unit1").addEventListener("click", () => { curUnit = 1; store.set("np-unit", 1); showTab("unit"); window.scrollTo({ top: 0 }); });

  /* ---------- 점수 그래프 ---------- */
  async function loadServerHist() {
    if (!API || !user || user.guest || !user.token) return;
    try {
      const r = await apiGet({ action: "history", name: user.name, token: user.token });
      if (r.ok) { serverHist = r.history; if (!$("#unit").hidden) renderChart(unitOf(curUnit)); }
    } catch {}
  }
  function attemptsFor(label) {
    const seen = new Map();
    [...(serverHist || []), ...myHist()].forEach(h => { if (h.mode === label && !seen.has(h.id || h.at)) seen.set(h.id || h.at, h); });
    return [...seen.values()].sort((a, b) => a.at - b.at);
  }
  function trend(points) {
    if (points.length === 1) return "once";
    const last2 = points.slice(-2);
    if (last2.every(p => p >= 80)) return "high";
    const ys = points.slice(-5), n = ys.length, mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
    const slope = num / den;
    if (slope === 0) return points[points.length - 1] >= 50 ? "up" : "down";
    return slope > 0 ? "up" : "down";
  }
  const svgEl = (tag, attrs) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  function renderChart(u) {
    const box = $("#chart-box"); box.replaceChildren();
    const data = attemptsFor(u.label);
    const pts = data.map(d => pct(d.score, d.total));
    if (!data.length) {
      box.append(el("p", "empty", "아직 푼 기록이 없어요. 단원 퀴즈를 풀면 여기에 점수 그래프가 생겨요."));
      $("#hist-text").textContent = ""; $("#cheer").hidden = true; return;
    }
    $("#cheer").hidden = false;
    $("#cheer-text").textContent = CHEERS[trend(pts)];
    $("#hist-text").textContent = "회차별 점수: " + pts.map(p => p + "%").join(" → ");

    const W = Math.max(280, box.clientWidth || 600), H = 190, L = 40, R = 18, T = 22, B = 30;
    const iw = W - L - R, ih = H - T - B;
    const x = i => data.length === 1 ? L + iw / 2 : L + iw * i / (data.length - 1);
    const y = v => T + ih * (1 - v / 100);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${u.label} 회차별 점수 그래프` });
    [0, 50, 100].forEach(v => {
      svg.append(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--line)", "stroke-width": 1 }));
      const t = svgEl("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--muted)", "font-family": "Quicksand, sans-serif" });
      t.textContent = v + "%"; svg.append(t);
    });
    const step = Math.ceil(data.length / 8);
    data.forEach((d, i) => {
      if (i % step && i !== data.length - 1) return;
      const t = svgEl("text", { x: x(i), y: H - 8, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)", "font-family": "Quicksand, sans-serif" });
      t.textContent = (i + 1) + "회"; svg.append(t);
    });
    if (data.length > 1) {
      const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p)}`).join("");
      svg.append(svgEl("path", { d: `${line}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z`, fill: "var(--sky-soft)", opacity: .7 }));
      svg.append(svgEl("path", { d: line, fill: "none", stroke: "var(--sky)", "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    }
    pts.forEach((p, i) => svg.append(svgEl("circle", { cx: x(i), cy: y(p), r: i === pts.length - 1 ? 6 : 4.5, fill: "var(--sky)", stroke: "var(--surface)", "stroke-width": 2 })));
    const lastT = svgEl("text", { x: x(pts.length - 1), y: y(pts[pts.length - 1]) - 12, "text-anchor": data.length > 1 ? "end" : "middle", "font-size": 13, "font-weight": 700, fill: "var(--fg)", "font-family": "Quicksand, sans-serif" });
    lastT.textContent = pts[pts.length - 1] + "%"; svg.append(lastT);

    const tip = el("div", "chart-tip"); tip.hidden = true;
    svg.addEventListener("pointermove", e => {
      const r = svg.getBoundingClientRect(), sx = (e.clientX - r.left) * W / r.width;
      let best = 0; data.forEach((_, i) => { if (Math.abs(x(i) - sx) < Math.abs(x(best) - sx)) best = i; });
      const d = data[best], dt = new Date(d.at);
      tip.textContent = `${best + 1}회 · ${d.score}/${d.total} (${pts[best]}%) · ${dt.getMonth() + 1}/${dt.getDate()}`;
      tip.style.left = (x(best) * r.width / W) + "px"; tip.style.top = (y(pts[best]) * r.height / H) + "px"; tip.hidden = false;
    });
    svg.addEventListener("pointerleave", () => tip.hidden = true);
    box.append(svg, tip);
  }
  let rsz; window.addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => { if (!$("#unit").hidden) renderChart(unitOf(curUnit)); }, 150); });

  /* ---------- 암송·약어 ---------- */
  $("#all-verses").replaceChildren(...VERSES.map(verseBox));
  $("#toggle-verses").addEventListener("click", e => {
    const on = $("#verse-card").classList.toggle("hide-verses");
    e.currentTarget.textContent = on ? "모두 보기" : "가리기"; e.currentTarget.setAttribute("aria-pressed", String(on));
    document.querySelectorAll("#all-verses q").forEach(q => q.classList.remove("peek"));
  });
  [["ot", "#abbr-ot"], ["nt", "#abbr-nt"]].forEach(([k, sel]) => BOOKS[k].forEach(([a, n]) => {
    const b = el("button", "abbr"); b.type = "button"; b.append(el("b", null, a), el("span", null, n));
    b.addEventListener("click", () => b.classList.toggle("peek"));
    $(sel).append(b);
  }));
  $("#toggle-abbr").addEventListener("click", e => {
    const on = $("#abbr-card").classList.toggle("hide-abbr");
    e.currentTarget.textContent = on ? "모두 보기" : "책 이름 가리기"; e.currentTarget.setAttribute("aria-pressed", String(on));
    document.querySelectorAll(".abbr").forEach(c => c.classList.remove("peek"));
  });

  /* ---------- 오답 노트 ---------- */
  const GROUPS = [...UNITS.map(u => [u.no, u.label]), ["verse", "암송 구절"], ["abbr", "성경 약어"]];
  function renderWrong() {
    const notes = Object.values(myWrong());
    $("#wrong-count").textContent = notes.length ? notes.length + "문제" : "";
    $("#start-wrong").disabled = !notes.length;
    const box = $("#wrong-groups"); box.replaceChildren();
    if (!user) { box.append(el("p", "empty", "이름을 고르면 내 오답 노트가 보여요.")); return; }
    if (!notes.length) { box.append(el("p", "empty", "아직 틀린 문제가 없어요. 퀴즈를 풀면 틀린 문제가 여기에 모여요.")); return; }
    GROUPS.forEach(([key, label]) => {
      const items = notes.map(n => ({ n, q: getQ(n.id) })).filter(x => x.q && x.q.unit === key).sort((a, b) => b.n.count - a.n.count);
      if (!items.length) return;
      box.append(el("p", "group-title", `${label} · ${items.length}`));
      const ul = el("ul", "wrong-list");
      items.forEach(({ n, q }) => {
        const li = el("li"), body = el("div");
        body.append(el("p", "wq", q.q), el("p", "wa", "정답: " + q.a), el("p", "wm", `${q.ref} · ${n.count}번 틀림`));
        const ok = el("button", "btn small", "외웠어요"); ok.type = "button";
        ok.addEventListener("click", () => { const w = myWrong(); delete w[n.id]; store.set(keyFor("wrong"), w); renderWrong(); });
        li.append(body, ok); ul.append(li);
      });
      box.append(ul);
    });
  }

  /* ---------- 퀴즈 ---------- */
  let RUN = null, timer = null, closeArmed = false;
  const MODES = {
    game: () => ({ label: GAME_LABEL, ids: GAME_IDS.slice() }),
    unit: () => { const u = unitOf(curUnit); return { label: u.label, unit: u, ids: shuffle(QUESTIONS[u.no].map(r => r[0])).slice(0, 10) }; },
    verse: () => ({ label: "암송 구절", ids: shuffle([...VERSE_QUESTIONS.map(r => r[0]), ...VERSE_FROM_UNITS]).slice(0, 10) }),
    abbr: () => ({ label: "성경 약어", ids: shuffle(ALLBOOKS).slice(0, 10).map(b => `ab-${Math.random() < .5 ? "n" : "a"}-${b[0]}`) }),
    wrong: () => ({ label: "오답 다시 풀기", ids: shuffle(Object.keys(myWrong())).slice(0, 10) })
  };
  function start(kind) {
    requireUser(() => {
      const m = MODES[kind]();
      const list = m.ids.map(getQ).filter(Boolean).map(q => ({ ...q, opts: shuffle([q.a, ...q.w]) }));
      if (!list.length) return;
      RUN = { kind, label: m.label, unit: m.unit, list, i: 0, score: 0, answers: [], t0: performance.now(), t1: 0, done: false };
      $("#run-mode").textContent = m.label;
      $("#run-q").hidden = false; $("#run-result").hidden = true; closeArmed = false;
      openOverlay("#runner");
      clearInterval(timer);
      timer = setInterval(() => { if (!RUN.t1) $("#q-timer").textContent = fmt(performance.now() - RUN.t0); }, 250);
      $("#q-timer").textContent = "00:00";
      renderQ();
    });
  }
  function renderQ() {
    const q = RUN.list[RUN.i];
    $("#q-count").textContent = `${RUN.i + 1} / ${RUN.list.length}`;
    $("#q-bar").style.width = (RUN.i / RUN.list.length * 100) + "%";
    $("#q-text").textContent = q.q;
    $("#q-fb").textContent = ""; $("#q-fb").className = "fb";
    $("#q-ref").textContent = ""; $("#q-next").hidden = true;
    $("#q-opts").replaceChildren(...q.opts.map(o => {
      const b = el("button", "opt", o); b.type = "button";
      b.addEventListener("click", () => answer(o)); return b;
    }));
    window.scrollTo({ top: 0 }); $("#runner").scrollTop = 0;
  }
  function answer(choice) {
    const q = RUN.list[RUN.i], ok = choice === q.a;
    if (ok) RUN.score++;
    RUN.answers.push({ q, ok, picked: choice });
    document.querySelectorAll("#q-opts .opt").forEach(b => {
      b.disabled = true;
      if (b.textContent === q.a) b.classList.add("right");
      else if (b.textContent === choice) b.classList.add("wrong");
    });
    $("#q-fb").textContent = ok ? "정답!" : "아쉬워요. 정답은 '" + q.a + "'";
    $("#q-fb").className = "fb " + (ok ? "ok" : "no");
    $("#q-ref").textContent = q.ref || "";
    const last = RUN.i === RUN.list.length - 1;
    if (last) RUN.t1 = performance.now();
    $("#q-next").textContent = last ? "결과 보기" : "다음";
    $("#q-next").hidden = false; $("#q-next").focus({ preventScroll: true });
  }
  $("#q-next").addEventListener("click", () => { if (RUN.i < RUN.list.length - 1) { RUN.i++; renderQ(); } else finish(); });
  $("#run-close").addEventListener("click", () => {
    if (RUN && !RUN.done && !closeArmed) {
      closeArmed = true; $("#q-fb").className = "fb no"; $("#q-fb").textContent = "그만두려면 × 를 한 번 더 누르세요. 기록은 남지 않아요.";
      return;
    }
    clearInterval(timer); RUN = null; closeOverlay("#runner");
  });
  $("#r-done").addEventListener("click", () => { clearInterval(timer); const k = RUN && RUN.kind; RUN = null; closeOverlay("#runner"); if (k === "unit") renderChart(unitOf(curUnit)); if (k === "game") loadRanking(); });
  $("#r-again").addEventListener("click", () => start(RUN ? RUN.kind : "unit"));

  async function finish() {
    clearInterval(timer);
    RUN.done = true;
    const ms = Math.round(RUN.t1 - RUN.t0);
    const att = { id: uid(), at: Date.now(), mode: RUN.label, score: RUN.score, total: RUN.list.length, ms };

    const hist = myHist(); hist.push(att); store.set(keyFor("hist"), hist.slice(-300));
    const w = myWrong();
    RUN.answers.forEach(({ q, ok }) => { if (ok) delete w[q.id]; else w[q.id] = { id: q.id, count: ((w[q.id] && w[q.id].count) || 0) + 1, at: att.at }; });
    store.set(keyFor("wrong"), w);

    const queue = store.get("np-queue", []);
    queue.push({ action: "submit", ...att, name: user.name, guest: !!user.guest,
      wrong: RUN.answers.filter(a => !a.ok).map(a => ({ id: a.q.id, q: a.q.q, a: a.q.a, picked: a.picked })) });
    store.set("np-queue", queue.slice(-100));

    $("#run-q").hidden = true; $("#run-result").hidden = false; $("#runner").scrollTop = 0;
    $("#r-score").textContent = RUN.score; $("#r-total").textContent = RUN.list.length; $("#r-time").textContent = fmt(ms);
    $("#r-review").replaceChildren(...RUN.answers.map(({ q, ok, picked }) => {
      const li = el("li"); li.append(el("span", ok ? "o" : "xx", ok ? "O" : "X"));
      const body = el("span", null, q.q);
      if (!ok) { body.append(document.createElement("br"), el("span", "ans", "정답: " + q.a)); body.append(el("span", "muted", " · 내 답: " + picked)); }
      li.append(body); return li;
    }));
    renderWrong();

    const cheer = $("#r-cheer");
    cheer.hidden = RUN.kind !== "unit";
    if (RUN.kind === "unit") $("#r-cheer-text").textContent = CHEERS[trend(attemptsFor(RUN.label).map(d => pct(d.score, d.total)))];

    const note = $("#r-note");
    note.textContent = RUN.kind === "game" ? "랭킹에 올리는 중…" : (API ? "기록을 저장하는 중…" : "이 기기에 기록했어요.");
    const kind = RUN.kind;
    const res = await flush();
    if (kind === "game") {
      const rows = await loadRanking();
      const me = rows ? rows.findIndex(r => r.name === rankName()) : -1;
      if (me >= 0) {
        const mine = rows[me];
        const first = mine.score === att.score && Math.abs(mine.ms - ms) < 1500;
        note.textContent = (first ? `랭킹 ${placeOf(rows, me)}등이에요!` : `랭킹에는 첫 기록(${mine.score}점)이 올라가 있어요. 지금 순위 ${placeOf(rows, me)}등.`);
      } else note.textContent = res === "offline" ? "인터넷이 연결되면 자동으로 랭킹에 올라가요." : "기록을 보냈어요. 랭킹 탭에서 확인하세요.";
    } else if (API) note.textContent = res === "offline" ? "인터넷이 연결되면 자동으로 저장돼요." : "기록을 저장했어요.";
  }

  /* ---------- 기록 보내기 ---------- */
  let flushing = null;
  function flush() {
    if (!API) return Promise.resolve("noapi");
    if (flushing) return flushing;
    flushing = (async () => {
      const q = store.get("np-queue", []), keep = [];
      let status = "ok";
      for (let k = 0; k < q.length; k++) {
        const item = q[k];
        if (!item.guest) {
          // 다른 사람이 이 기기에서 남긴 기록은 그 사람이 다시 들어올 때 보내요
          if (!user || user.guest || user.name !== item.name || !user.token) { keep.push(item); continue; }
          item.token = user.token;
        }
        let r;
        try { r = await apiPost(item); } catch { status = "offline"; keep.push(...q.slice(k)); break; }
        if (!r.ok && String(r.error).startsWith("AUTH")) {
          status = "auth"; keep.push(...q.slice(k));
          user = { ...user, token: null }; store.set("np-user", user);
          openLogin(); break;
        }
      }
      const sent = new Set(q.map(x => x.id));
      store.set("np-queue", [...keep, ...store.get("np-queue", []).filter(x => !sent.has(x.id))]);
      if (status === "ok") loadServerHist();
      flushing = null; return status;
    })();
    return flushing;
  }
  window.addEventListener("online", () => flush());

  /* ---------- 랭킹 ---------- */
  const placeOf = (rows, i) => { let p = i; while (p > 0 && rows[p - 1].score === rows[i].score && rows[p - 1].ms === rows[i].ms) p--; return p + 1; };
  let lastRows = null;
  async function loadRanking() {
    let rows;
    if (!API) {
      const g = myHist().filter(h => h.mode === GAME_LABEL);
      rows = g.length && user ? [{ name: rankName(), score: g[0].score, total: g[0].total, ms: g[0].ms }] : [];
      $("#rank-note").hidden = false;
      $("#rank-note").textContent = "기록 서버가 아직 연결되지 않아 이 기기의 기록만 보여요. (설정 안내서 3단계)";
    } else {
      try { const r = await apiGet({ action: "ranking" }); if (!r.ok) throw 0; rows = r.ranking; $("#rank-note").hidden = true; }
      catch { $("#rank-note").hidden = false; $("#rank-note").textContent = "랭킹을 불러오지 못했어요. 새로고침을 눌러주세요."; return lastRows; }
    }
    lastRows = rows; renderBoard(rows); renderGameNote(); return rows;
  }
  function renderBoard(rows) {
    const ul = $("#board"); ul.replaceChildren();
    if (!rows.length) { ul.append(el("li", "empty", "아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!")); ul.firstChild.style.display = "block"; return; }
    rows.forEach((r, i) => {
      const p = placeOf(rows, i), li = el("li");
      if (r.name === rankName()) li.className = "me";
      li.append(el("span", "rank" + (p <= 3 ? " r" + p : ""), String(p)));
      const nm = el("span", "bname", r.name); if (r.name === rankName()) nm.append(el("small", null, "나"));
      li.append(nm);
      const pts = el("span", "bpts"); pts.append(el("b", null, `${r.score}/${r.total}`), el("span", null, fmt(r.ms)));
      li.append(pts); ul.append(li);
    });
  }
  function renderGameNote() {
    const n = $("#game-note");
    const mine = lastRows && user ? lastRows.find(r => r.name === rankName()) : null;
    n.textContent = mine ? `이미 랭킹에 올라가 있어요 (${mine.score}/${mine.total}). 다시 풀 수 있지만 순위는 첫 기록 기준이에요.` : "랭킹에는 첫 번째 기록만 올라가요.";
  }
  $("#refresh-rank").addEventListener("click", loadRanking);
  setInterval(() => { if (!document.hidden && !$("#game").hidden && $("#runner").hidden) loadRanking(); }, 15000);

  /* ---------- 시작 버튼 ---------- */
  $("#start-game").addEventListener("click", () => start("game"));
  $("#start-unit").addEventListener("click", () => start("unit"));
  $("#start-verse").addEventListener("click", () => start("verse"));
  $("#start-abbr").addEventListener("click", () => start("abbr"));
  $("#start-wrong").addEventListener("click", () => start("wrong"));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#login").hidden) { pending = null; closeOverlay("#login"); } });

  /* ---------- 처음 화면 ---------- */
  setUser(user);
  showTab((location.hash || "").slice(1) || store.get("np-tab", "game"));
  if (location.hash) {
    // #unit 같은 주소로 열어도 탭 위치로 튀지 않고 맨 위(헤더)부터 보이게
    history.replaceState(null, "", location.pathname + location.search);
    window.addEventListener("load", () => window.scrollTo(0, 0));
  }
  if (!user) openLogin();
})();
