/* panel-fx.js — رفع باگ پاک‌سازی شبانه + افکت‌های GSAP / Lenis / React Bits (vanilla)
   بعد از اسکریپت اصلی، قبل از </body>:  <script src="panel-fx.js"></script> */
(function () {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d));
  const faNum = (n) => String(n).replace(/\d/g, (d) => FA[d]);
  const load = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });

  /* =====================================================
     بخش ۱) پاک‌سازی شبانه — بر اساس تاریخ تهران، با چک خطا
     ===================================================== */
  const NOTM = "(__reset__,__reset_v2__)", MK = "__reset_v2__";
  const tehranKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  let sb = null, doneKey = null, syncedKey = tehranKey(), warnedKey = null;

  /* حالت آفلاین: کلیدهای محلی با عوض شدن روز پاک شوند (قبل از اینکه صفحه آن‌ها را بخواند) */
  function wipeLocal(k) {
    try {
      Object.keys(localStorage).forEach((x) => { if (/^(bmagent-\d+-\d|bmts-\d+-\d)/.test(x)) localStorage.removeItem(x); });
      localStorage.setItem("bm-day", k);
    } catch (e) {}
  }
  try { if (localStorage.getItem("bm-day") !== syncedKey) wipeLocal(syncedKey); } catch (e) {}

  async function getClient() {
    try { if (window.supabase && window.supabase.createClient) return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) {}
    try { return (await import("https://esm.sh/@supabase/supabase-js@2")).createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) { return null; }
  }

  async function dailyReset(k) {
    let prev = null;
    const revert = async () => {
      try {
        if (prev !== null) await sb.from("names").update({ value: prev }).eq("key", MK);
        else await sb.from("names").delete().eq("key", MK);
      } catch (e) {}
    };
    try {
      let claimed = false;
      const r0 = await sb.from("names").select("value").eq("key", MK).maybeSingle();
      if (r0.error) throw r0.error;
      if (!r0.data) {
        const r = await sb.from("names").upsert({ key: MK, value: k, date: k }, { onConflict: "key", ignoreDuplicates: true }).select();
        if (r.error) throw r.error;
        claimed = !!(r.data && r.data.length);
      } else if (r0.data.value !== k) {
        prev = r0.data.value;
        const r = await sb.from("names").update({ value: k, date: k }).eq("key", MK).neq("value", k).select();
        if (r.error) throw r.error;
        claimed = !!(r.data && r.data.length);
      }
      if (claimed) {
        const orc = "ts.is.null,ts.lt." + Date.parse(k + "T00:00:00+03:30");
        let useTs = true;
        let q = await sb.from("names").delete().not("key", "in", NOTM).or(orc);
        if (q.error) { useTs = false; q = await sb.from("names").delete().not("key", "in", NOTM); }
        if (q.error) { await revert(); throw q.error; }
        let cq = sb.from("names").select("key", { count: "exact", head: true }).not("key", "in", NOTM);
        if (useTs) cq = cq.or(orc);
        const left = await cq;
        if (!left.error && left.count > 0) { await revert(); throw new Error("حذف انجام نشد (احتمالاً سیاست DELETE در Supabase بسته است)"); }
      }
      return { ok: true, claimed };
    } catch (e) {
      console.error("[daily-reset]", e);
      if (warnedKey !== k) { warnedKey = k; try { showToast("پاک‌سازی شبانه انجام نشد؛ کنسول مرورگر را ببین", true); } catch (_) {} }
      return { ok: false };
    }
  }

  async function syncFromDb() {
    const r = await sb.from("names").select("key,value");
    if (r.error) return;
    const m = new Map((r.data || []).map((x) => [x.key, x.value]));
    nameInputs.forEach((i) => {
      if (document.activeElement === i) return;
      const v = m.get(i.dataset.key) || "";
      if (i.value !== v) i.value = v;
      if (!v) delete tsMap[i.dataset.key];
    });
    updateCount();
  }

  async function tick() {
    const k = tehranKey();
    if (liveDot.classList.contains("offline")) {
      if (k !== localStorage.getItem("bm-day")) {
        wipeLocal(k);
        nameInputs.forEach((i) => { i.value = ""; });
        Object.keys(tsMap).forEach((x) => delete tsMap[x]);
        updateCount();
      }
      return;
    }
    if (!sb || k === doneKey) return;
    const res = await dailyReset(k);
    if (!res.ok) return;
    doneKey = k;
    if (res.claimed || k !== syncedKey) await syncFromDb();
    syncedKey = k;
  }

  (async () => {
    if (!window.supabase) { try { await load("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"); } catch (e) {} }
    sb = await getClient();
    setTimeout(tick, 2500);
    setInterval(tick, 20000);                       // به‌جای یک setTimeout بلند که در موبایل/خواب از کار می‌افتد
    ["focus", "online"].forEach((ev) => addEventListener(ev, tick));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  })();

  /* =====================================================
     بخش ۲) افکت‌ها — GSAP + Lenis + ایده‌های React Bits
     ===================================================== */
  if (REDUCE) return;
  root.classList.add("fx-pre");
  setTimeout(() => root.classList.remove("fx-pre"), 4500);   // شبکهٔ ایمنی

  const st = document.createElement("style");
  st.textContent = `
    html.fx-pre header.topbar, html.fx-pre .card, html.fx-pre .mascot, html.fx-pre .reset-note, html.fx-pre footer, html.fx-pre .mini-credit { opacity:0; }
    header.topbar, .card, .status-line, .ledger, .reset-note, .mascot { animation:none !important; }
    html.lenis, html.lenis body { height:auto; }
    .lenis.lenis-smooth { scroll-behavior:auto !important; }
    .lenis.lenis-stopped { overflow:hidden; }
    #net { position:absolute; inset:0; width:100%; height:100%; }
    tbody tr:hover { background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%), color-mix(in srgb, var(--accent1) 16%, transparent), rgba(255,255,255,.03) 70%); }
  `;
  document.head.appendChild(st);

  Promise.allSettled([
    load("https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"),
    load("https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js")
  ]).then(() => {
    if (typeof gsap === "undefined") { root.classList.remove("fx-pre"); return; }

    /* ورود سینمایی */
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.from(".logo-box", { scale: 0, rotation: -200, duration: 1.1, ease: "back.out(1.8)" })
      .from("header h1", { autoAlpha: 0, filter: "blur(14px)", y: 16, duration: 1, clearProps: "filter,transform,opacity,visibility" }, 0.2)
      .from("header p", { autoAlpha: 0, y: 12, duration: 0.7 }, 0.4)
      .from(".card", { y: 80, scale: 0.93, rotationX: -12, autoAlpha: 0, transformOrigin: "50% 100%", duration: 1.3, clearProps: "transform,opacity,visibility" }, 0.3)
      .from(".status-line .pill, .status-line button", { y: 18, autoAlpha: 0, scale: 0.8, stagger: 0.08, duration: 0.7, ease: "back.out(2)" }, 0.8)
      .from("thead th", { y: -10, autoAlpha: 0, stagger: 0.06, duration: 0.6 }, 0.9)
      .from("tbody tr", { x: (i) => (i % 2 ? 60 : -60), autoAlpha: 0, rotationX: -30, transformPerspective: 700, stagger: 0.07, duration: 0.9, clearProps: "transform,opacity,visibility" }, 0.95)
      .from("tfoot td", { autoAlpha: 0, duration: 0.6 }, 1.4)
      .from(".reset-note, footer, .mini-credit", { autoAlpha: 0, y: 10, stagger: 0.08, duration: 0.6 }, 1.5)
      .from(".mascot", { x: -160, autoAlpha: 0, duration: 1.2, ease: "back.out(1.4)", clearProps: "transform,opacity,visibility" }, 1);
    root.classList.remove("fx-pre");

    /* CountUp (React Bits) برای تعدادها */
    function countUp(el, from) {
      let shown = from, busy = false;
      const check = () => {
        if (busy) return;
        const to = parseInt(toEn(el.textContent)) || 0;
        if (to === shown) return;
        busy = true;
        const o = { v: shown };
        gsap.to(o, { v: to, duration: 0.9, ease: "power2.out",
          onUpdate: () => { el.textContent = faNum(Math.round(o.v)); },
          onComplete: () => {
            el.textContent = faNum(to); shown = to; busy = false;
            gsap.fromTo(el, { textShadow: "0 0 18px var(--accent2)" }, { textShadow: "0 0 0 transparent", duration: 1 });
            setTimeout(check, 0);
          } });
      };
      new MutationObserver(check).observe(el, { childList: true, characterData: true, subtree: true });
    }
    countUp($("repCount"), parseInt(toEn($("repCount").textContent)) || 0);
    const lc = $("liveCount"), lcTo = parseInt(toEn(lc.textContent)) || 0, lo = { v: 0 };
    gsap.to(lo, { v: lcTo, duration: 1.4, delay: 1, ease: "power3.out", onUpdate: () => { lc.textContent = faNum(Math.round(lo.v)); } });

    /* Lenis: اسکرول نرم صفحه (مفید روی موبایل)، با موتور GSAP */
    let lenis = null;
    if (window.Lenis) {
      lenis = new Lenis({ lerp: 0.09 });
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      const rm = document.querySelector(".rules-modal");
      if (rm) rm.setAttribute("data-lenis-prevent", "");
      lenis.on("scroll", ({ scroll }) => gsap.set(".mascot", { y: -scroll * 0.12 }));
    }

    /* پنجرهٔ قوانین */
    const ro = $("rulesOverlay");
    new MutationObserver(() => {
      if (!ro.classList.contains("show")) { lenis && lenis.start(); return; }
      lenis && lenis.stop();
      gsap.fromTo(".rules-modal", { y: 60, scale: 0.9, autoAlpha: 0, filter: "blur(8px)" }, { y: 0, scale: 1, autoAlpha: 1, filter: "blur(0px)", duration: 0.7, ease: "expo.out", clearProps: "transform,filter,opacity,visibility" });
      gsap.from(".rule-section", { y: 24, autoAlpha: 0, stagger: 0.07, duration: 0.7, delay: 0.15, ease: "power3.out", clearProps: "transform,opacity,visibility" });
    }).observe(ro, { attributes: true, attributeFilter: ["class"] });

    /* Spotlight روی ردیف‌ها (React Bits) */
    if (FINE) $("tbody").addEventListener("pointermove", (e) => {
      const tr = e.target.closest("tr"); if (!tr) return;
      const r = tr.getBoundingClientRect();
      tr.style.setProperty("--mx", (e.clientX - r.left) + "px");
      tr.style.setProperty("--my", (e.clientY - r.top) + "px");
    });

    /* Click Spark (React Bits) — با هر کلیک، مخصوصاً موقع کپی */
    const cv = document.createElement("canvas");
    Object.assign(cv.style, { position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 120 });
    document.body.appendChild(cv);
    const cx = cv.getContext("2d"), dpr = Math.min(devicePixelRatio || 1, 2), sp = [];
    let W, H;
    const fit = () => { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit(); addEventListener("resize", fit);
    const cssv = (n) => getComputedStyle(root).getPropertyValue(n).trim();
    addEventListener("pointerdown", (e) => {
      const copy = e.target.closest && e.target.closest(".credential");
      const cols = copy ? [cssv("--mint"), cssv("--accent2")] : [cssv("--accent2"), cssv("--accent1")];
      const n = copy ? 12 : 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + Math.random() * 0.5, s = 2 + Math.random() * 3.5;
        sp.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1, c: cols[i % 2], n: 5 + Math.random() * 8 });
      }
    });
    let dirty = false;
    gsap.ticker.add(() => {
      if (!sp.length) { if (dirty) { cx.clearRect(0, 0, W, H); dirty = false; } return; }
      dirty = true; cx.clearRect(0, 0, W, H);
      for (let i = sp.length - 1; i >= 0; i--) {
        const p = sp[i];
        p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.l -= 0.03;
        if (p.l <= 0) { sp.splice(i, 1); continue; }
        const m = Math.hypot(p.vx, p.vy) || 1;
        cx.globalAlpha = p.l; cx.strokeStyle = p.c; cx.lineWidth = 2; cx.lineCap = "round";
        cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.vx / m * p.n * p.l, p.y - p.vy / m * p.n * p.l); cx.stroke();
      }
    });

    /* شبکهٔ ذرات پس‌زمینه */
    const bg = document.querySelector(".bg"), net = document.createElement("canvas");
    net.id = "net"; bg.insertBefore(net, bg.querySelector(".dots"));
    const nx = net.getContext("2d"); let NW, NH, pts = [], col = "#6d5bff", fr = 0;
    const m = { x: -999, y: -999 };
    const nsize = () => {
      NW = innerWidth; NH = innerHeight; net.width = NW * dpr; net.height = NH * dpr; nx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = Array.from({ length: Math.min(70, Math.floor(NW * NH / 20000)) }, () => ({ x: gsap.utils.random(0, NW), y: gsap.utils.random(0, NH), vx: gsap.utils.random(-0.15, 0.15), vy: gsap.utils.random(-0.15, 0.15) }));
    };
    nsize(); addEventListener("resize", nsize);
    addEventListener("pointermove", (e) => { m.x = e.clientX; m.y = e.clientY; });
    gsap.ticker.add(() => {
      if (document.hidden) return;
      if (fr++ % 60 === 0) col = cssv("--accent1") || col;
      nx.clearRect(0, 0, NW, NH); nx.fillStyle = nx.strokeStyle = col;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > NW) p.vx *= -1;
        if (p.y < 0 || p.y > NH) p.vy *= -1;
        nx.globalAlpha = 0.55; nx.beginPath(); nx.arc(p.x, p.y, 1.6, 0, 6.283); nx.fill();
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j], d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < 120) { nx.globalAlpha = (1 - d / 120) * 0.3; nx.beginPath(); nx.moveTo(p.x, p.y); nx.lineTo(q.x, q.y); nx.stroke(); }
        }
        const md = Math.hypot(p.x - m.x, p.y - m.y);
        if (md < 170) { nx.globalAlpha = (1 - md / 170) * 0.6; nx.beginPath(); nx.moveTo(p.x, p.y); nx.lineTo(m.x, m.y); nx.stroke(); }
      }
    });

    /* مسکات: دنبال کردن نرم موس */
    const mas = document.querySelector(".mascot");
    if (FINE && mas) {
      const qx = gsap.quickTo(mas, "x", { duration: 1.2, ease: "power3.out" });
      addEventListener("pointermove", (e) => qx((e.clientX / innerWidth - 0.5) * 22));
    }
  });
})();
