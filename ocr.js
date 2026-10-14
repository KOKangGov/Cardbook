/* 명함 사진 → 사진 다듬기 → 글자 인식(Tesseract.js, 무료·기기 안에서 처리, 두 가지 크기로 읽어 합침) → 항목 나누기(규칙 기반) */
(function (root) {
  "use strict";
  const TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

  // ---------- 항목 나누기 ----------
  const TITLES = [
    "대표이사", "공동대표", "대표", "회장", "부회장", "사장", "부사장", "전무이사", "전무", "상무이사", "상무", "이사",
    "본부장", "센터장", "사업부장", "실장", "원장", "소장", "국장", "단장", "팀장", "파트장", "그룹장", "지점장", "점장",
    "부장", "차장", "과장", "대리", "주임", "사원", "책임연구원", "선임연구원", "수석연구원", "전임연구원", "연구원",
    "수석", "책임", "선임", "매니저", "프로", "위원", "교수", "부교수", "조교수", "변호사", "세무사", "회계사", "노무사",
    "변리사", "법무사", "디자이너", "엔지니어", "컨설턴트", "PD", "CEO", "CTO", "CFO", "COO", "CMO",
    "Vice President", "President", "Director", "Manager", "Engineer", "Designer", "Consultant", "Partner",
    "Founder", "Researcher", "Head", "Lead", "Senior", "VP"
  ].sort((a, b) => b.length - a.length);
  const SURNAMES = "김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경";

  const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;
  const RE_WEB = /(?:https?:\/\/)?(?:www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:co\.kr|or\.kr|go\.kr|ac\.kr|re\.kr|com|net|org|kr|io|ai|biz|info))(?:\/[\w./-]*)?/i;
  const RE_PHONE = /(?:\+?\s?82[\s.\-)]*)?\(?0\d{1,3}\)?[\s.\-]*\d{3,4}[\s.\-]*\d{4}|(?:\+?\s?82[\s.\-)]*)\d{1,2}[\s.\-]*\d{3,4}[\s.\-]*\d{4}|1[5689]\d{2}[\s.\-]*\d{4}/g;
  const L_MOBILE = /(?:^|[\s,/|])(?:M|Mob|Mobile|HP|H\.P|H\/P|C|Cell|휴대폰|휴대전화|휴대|핸드폰|모바일)\s*[.:)]?\s*$/i;
  const L_FAX = /(?:^|[\s,/|])(?:F|Fax|팩스)\s*[.:)]?\s*$/i;
  const L_TEL = /(?:^|[\s,/|])(?:T|Tel|Phone|O|Office|D|Direct|DID|전화|직통|대표전화|대표)\s*[.:)]?\s*$/i;
  const RE_LABEL_ONLY = /^(?:[A-Za-z]{1,6}\.?|[A-Za-z]\/[A-Za-z]|전화|직통|대표전화|휴대폰|휴대전화|핸드폰|팩스|이메일|메일|홈페이지|웹|주소)\s*[.:)]?$/i;
  const RE_REGION = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)/;
  const RE_ADDR = /[가-힣0-9]+(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구|읍|면|동|로|길|번길)(?=\s|\d|,|$)/g;
  const RE_ADDR_EN = /(-gu|-si|-ro|-gil|-dong|-do\b|Seoul|Busan|Incheon|Gyeonggi|Korea|Rep\. of Korea)/i;
  const RE_ADDR_TAIL = /(층|호|빌딩|타워|센터|오피스텔|아파트|Bldg|Building|Tower|Floor|\d+F\b)/i;
  const RE_COMP_STRONG = /(주식회사|㈜|\(\s*주\s*\)|\(\s*유\s*\)|유한회사|유한책임회사|합자회사|재단법인|사단법인|협동조합|법무법인|회계법인|세무법인|특허법인|Co\.?,?\s*Ltd\.?|Inc\.?|Corp\.?|Corporation|LLC|GmbH)/i;
  const RE_COMP_WEAK = /(그룹|홀딩스|공사|공단|병원|의원|대학교|연구소|은행|증권|보험|건설|산업|전자|테크|솔루션|컨설팅|법률사무소|미디어|엔터테인먼트|Company|Group|Ltd\.?)/i;
  const RE_DEPT = /([가-힣A-Za-z0-9&·]{1,}(?:\s?[가-힣A-Za-z0-9&·]+)*?(?:사업본부|사업부|본부|부문|센터|그룹|실|팀|부|과|파트|Lab|Team|Dept\.?|Department|Division|Group))$/;

  // 주소 첫머리(시·도) 오인식 바로잡기: 서물특별시 → 서울특별시
  const REGIONS = ["서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시", "경기도", "강원특별자치도", "강원도", "충청북도", "충청남도", "전북특별자치도", "전라북도", "전라남도", "경상북도", "경상남도", "제주특별자치도"];
  function editDist(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function fixRegion(addr) {
    const m = addr.match(/^\S+/); if (!m) return addr;
    const w = m[0]; if (REGIONS.includes(w) || w.length < 3) return addr;
    let best = null, bd = 9; for (const r of REGIONS) { const d = editDist(w, r); if (d < bd) { bd = d; best = r; } }
    return best && bd <= (best.length >= 5 ? 2 : 1) ? best + addr.slice(w.length) : addr;
  }
  // 줄 끝에 붙은 로고·잡티(BB, 7, - 같은 짧은 조각) 떼기
  const dropTailJunk = s => s.replace(/(?:\s+(?:[A-Za-z]{1,3}|[0-9]{1,2}|[-~.,:;!'"`|]+|[ㄱ-ㅎㅏ-ㅣ]+))+$/, "").trim();
  // 직책은 보통 줄 끝에 오므로, 여러 개가 걸리면 가장 뒤에 있는 것(같으면 긴 것)을 고름
  function findTitle(s, sq) {
    let best = "", pos = -1;
    for (const t of TITLES) {
      let i;
      if (/^[A-Za-z ]+$/.test(t)) { const m = new RegExp("\\b" + t + "\\b", "i").exec(s); i = m ? m.index / Math.max(1, s.length) * sq.length : -1; }
      else { i = sq.lastIndexOf(t); if (i >= 0) i += t.length; }
      if (i > pos || (i === pos && t.length > best.length)) { pos = i; best = i >= 0 ? t : best; }
    }
    return pos >= 0 ? best : "";
  }
  const clean = s => String(s || "").replace(/[|_~`"“”‘’<>{}\[\]©®™•●■◆▪︎]/g, " ").replace(/\s+/g, " ").trim();
  const squash = s => s.replace(/([가-힣])\s+(?=[가-힣])/g, "$1");
  const digitsOf = s => String(s || "").replace(/\D/g, "");

  function fmtPhone(raw) {
    let d = digitsOf(raw);
    if (d.startsWith("82") && d.length >= 10) d = "0" + d.slice(2);
    if (/^1[5689]\d{6}$/.test(d)) return d.slice(0, 4) + "-" + d.slice(4);
    if (d.startsWith("02")) {
      if (d.length === 9) return `02-${d.slice(2, 5)}-${d.slice(5)}`;
      if (d.length === 10) return `02-${d.slice(2, 6)}-${d.slice(6)}`;
    }
    if (/^050\d/.test(d) && d.length === 12) return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    return String(raw).trim();
  }
  function validPhone(d) {
    if (d.startsWith("82")) d = "0" + d.slice(2);
    return /^1[5689]\d{6}$/.test(d) || (/^0\d{8,11}$/.test(d));
  }

  // lines: [{text, h}] (h = 글자 높이, 클수록 눈에 띄는 줄)
  function parse(lines) {
    const out = { name: "", company: "", dept: "", title: "", mobile: "", phone: "", fax: "", email: "", address: "", website: "" };
    const L = lines.map((l, i) => ({ i, raw: clean(l.text), h: l.h || 1, used: false })).filter(l => l.raw.length >= 2);
    const extraPhones = [];

    // 1) 연락처(이메일·웹·전화)를 먼저 떼어 냄
    for (const l of L) {
      let s = l.raw.replace(/\s*@\s*/g, "@").replace(/(@[a-z0-9-]+)\s*\.\s*(?=[a-z])/gi, "$1.").replace(/\.\s+(?=(?:com|net|org|kr|co)\b)/gi, ".").replace(/(@[a-z0-9-]+(?:\.[a-z0-9-]+)*)\s+(?=(?:co\.kr|com|net|org|kr)\b)/gi, "$1.");
      const em = s.match(RE_EMAIL);
      if (em) { if (!out.email) out.email = em[0].replace(/^[.\-]+|[.\-]+$/g, ""); s = s.replace(em[0], " "); l.contact = true; }
      const wm = s.match(RE_WEB);
      if (wm && !/@/.test(wm[0]) && !/^\d/.test(wm[0])) { if (!out.website) out.website = wm[0].replace(/[.,]$/, ""); s = s.replace(wm[0], " "); l.contact = true; }
      let rest = "", last = 0, m;
      RE_PHONE.lastIndex = 0;
      while ((m = RE_PHONE.exec(s))) {
        const d = digitsOf(m[0]);
        if (!validPhone(d)) continue;
        const before = s.slice(last, m.index);
        let kind = L_FAX.test(before) ? "fax" : L_MOBILE.test(before) ? "mobile" : L_TEL.test(before) ? "phone" : "";
        if (!kind) kind = /^(?:82)?0?1[016789]/.test(d) && (d.startsWith("01") || d.startsWith("821")) ? "mobile" : "";
        rest += before.replace(/(?:^|\s)(?:M|Mob|Mobile|HP|H\.P|H\/P|C|Cell|F|Fax|T|Tel|Phone|O|Office|D|Direct|DID|휴대폰|휴대전화|휴대|핸드폰|모바일|팩스|전화|직통|대표전화)\s*[.:)]?\s*$/i, " ");
        last = m.index + m[0].length;
        const v = fmtPhone(m[0]);
        if (kind && !out[kind]) out[kind] = v; else extraPhones.push(v);
        l.contact = true;
      }
      rest += s.slice(last);
      rest = rest.replace(/(?:^|\s)(?:E-?mail|Email|E|이메일|메일|Web|Homepage|홈페이지|URL)\s*[.:)]?\s*(?=\s|$)/gi, " ");
      l.rest = clean(rest);
      if (l.contact && (!l.rest || RE_LABEL_ONLY.test(l.rest) || l.rest.length < 2)) l.used = true;
    }
    for (const v of extraPhones) { if (!out.phone) out.phone = v; else if (!out.fax && v !== out.phone) out.fax = v; }

    const open = () => L.filter(l => !l.used && l.rest);

    // 2) 주소
    let best = null, bestScore = 0;
    for (const l of open()) {
      const s = l.rest.replace(/^(?:주소|Add(?:ress)?|A)\s*[.:)]?\s*/i, "");
      const hits = (s.match(RE_ADDR) || []).length;
      let score = hits + (RE_REGION.test(s) ? 2 : 0) + (/\d/.test(s) ? 1 : 0) + (RE_ADDR_EN.test(s) ? 2 : 0);
      if (s.length < 8) score -= 2;
      if (score > bestScore) { bestScore = score; best = { l, s }; }
    }
    if (best && bestScore >= 3) {
      let addr = best.s; best.l.used = true;
      const next = L.find(x => x.i === best.l.i + 1 && !x.used && x.rest);
      if (next && RE_ADDR_TAIL.test(next.rest) && next.rest.length <= 30 && !RE_COMP_STRONG.test(next.rest)) { addr += " " + next.rest; next.used = true; }
      out.address = fixRegion(addr.replace(/\s+,/g, ",").trim());
    }

    // 3) 회사
    const comp = open().map(l => ({ l, sc: RE_COMP_STRONG.test(l.rest) ? 3 : RE_COMP_WEAK.test(l.rest) ? 1 : 0 })).filter(x => x.sc && x.l.rest.length <= 40).sort((a, b) => b.sc - a.sc || b.l.h - a.l.h)[0];
    if (comp) { out.company = dropTailJunk(comp.l.rest.replace(/\(\s*주\s*\)/g, "(주)").replace(/\s{2,}/g, " ")); comp.l.used = true; }

    // 4) 직책·이름·부서
    const names = [];
    for (const l of open()) {
      // "홍길동 영업팀 과장"처럼 이름 뒤에 부서·직책이 같은 줄에 있으면 이름을 먼저 떼어 냄
      const lead = l.rest.match(/^([가-힣]{2,4})\s+(.+)$/);
      if (lead && SURNAMES.includes(lead[1][0]) && !RE_COMP_STRONG.test(l.rest) && !RE_ADDR.test(lead[1])) {
        names.push({ l, nm: lead[1], sc: l.h * 1.5 * (lead[1].length === 3 ? 1.25 : 1) * 0.95, rest: lead[2] });
      }
      let s = l.rest, sq = squash(s);
      const title = findTitle(s, sq);
      if (title) {
        if (!out.title) out.title = title;
        sq = sq.replace(title, " ").replace(/\s+/g, " ").trim();
        s = /^[A-Za-z ]+$/.test(title) ? s.replace(new RegExp("\\b" + title + "\\b", "i"), " ").trim() : sq;
        l.used = true;
      }
      const hm = sq.match(/^([가-힣]{2,4})(?:\s+[A-Za-z][A-Za-z.\- ]*)?$/) || sq.match(/^[A-Za-z][A-Za-z.\- ]*\s+([가-힣]{2,4})$/);
      if (hm) {
        const nm = hm[1];
        const sur = SURNAMES.includes(nm[0]) ? 1.5 : 0.6;
        names.push({ l, nm, sc: l.h * sur * (nm.length === 3 ? 1.25 : 1) * (title ? 1.2 : 1) });
        continue;
      }
      const dm = s.match(RE_DEPT);
      if (dm && !out.dept && s.length <= 30 && !/\d{3,}/.test(s)) { out.dept = dm[1].trim(); l.used = true; continue; }
      if (title && sq && !out.dept && sq.length <= 20) { out.dept = sq; }
    }
    names.sort((a, b) => b.sc - a.sc);
    if (names[0]) {
      out.name = names[0].nm; names[0].l.used = true;
      // 이름과 같은 줄에 있던 부서·직책 다시 읽기
      if (names[0].rest) {
        const r = names[0].rest, rq = squash(r);
        if (!out.title) out.title = findTitle(r, rq);
        const restNoTitle = out.title ? rq.replace(out.title, "").trim() : rq;
        const dm = restNoTitle.match(RE_DEPT);
        if (dm && (!out.dept || out.dept.includes(out.name))) out.dept = dm[1].trim();
      }
    }
    if (out.dept && out.name && out.dept.startsWith(out.name)) out.dept = out.dept.slice(out.name.length).replace(/^[\s.]+/, "");
    if (!out.name) {
      const en = open().filter(l => /^(?:[A-Z][a-z]+|[A-Z]{2,})(?:[\s-](?:[A-Z][a-z]+|[A-Z]{2,})){1,2}$/.test(l.rest) && !RE_COMP_WEAK.test(l.rest)).sort((a, b) => b.h - a.h)[0];
      if (en) { out.name = en.rest; en.used = true; }
    }

    // 5) 회사를 못 찾았으면: 남은 줄 중 글자가 가장 큰 줄
    if (!out.company) {
      const c = open().filter(l => !/\d{3,}/.test(l.rest) && l.rest.length <= 25 && l.rest.length >= 2 && !RE_LABEL_ONLY.test(l.rest)).sort((a, b) => b.h - a.h)[0];
      if (c) { out.company = c.rest; c.used = true; }
    }
    return out;
  }

  // ---------- 사진 다듬기 + 인식 ----------
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load")); document.head.appendChild(s); });
  }
  // 사진 다듬기: 조명 고르게 → 어두운 명함은 반전 → 선명하게 → 대비 늘리기 (픽셀 배열만 다루는 순수 함수)
  function boxBlurF(a, W, H, r) {
    const t = new Float32Array(a.length), k = 2 * r + 1, o = new Float32Array(a.length);
    for (let y = 0; y < H; y++) { const row = y * W; let s = 0; for (let x = -r; x <= r; x++) s += a[row + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) { t[row + x] = s / k; s += a[row + Math.min(W - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; } }
    for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) { o[y * W + x] = s / k; s += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x]; } }
    return o;
  }
  function enhance(p, W, H) { // p: RGBA (already at target size), rewritten in place as gray
    const N = W * H, g = new Float32Array(N), hist = new Uint32Array(256);
    for (let i = 0; i < N; i++) { g[i] = (p[4 * i] * 299 + p[4 * i + 1] * 587 + p[4 * i + 2] * 114) / 1000; hist[g[i] | 0]++; }
    let acc = 0, med = 128; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= N / 2) { med = v; break; } }
    if (med < 110) for (let i = 0; i < N; i++) g[i] = 255 - g[i];
    const R = Math.max(4, Math.round(Math.max(W, H) / 40));
    let bg = boxBlurF(boxBlurF(g, W, H, R), W, H, R);
    for (let i = 0; i < N; i++) bg[i] = Math.max(bg[i], g[i]);
    bg = boxBlurF(bg, W, H, R);
    const f = new Float32Array(N); for (let i = 0; i < N; i++) f[i] = Math.min(1.2, g[i] / Math.max(1, bg[i]));
    const bl = boxBlurF(f, W, H, 2); for (let i = 0; i < N; i++) f[i] += 0.8 * (f[i] - bl[i]);
    const h2 = new Uint32Array(512); for (let i = 0; i < N; i++) h2[Math.max(0, Math.min(511, f[i] * 400 | 0))]++;
    let lo = 0, hi = 511; acc = 0; for (let v = 0; v < 512; v++) { acc += h2[v]; if (acc > N * 0.005) { lo = v; break; } }
    acc = 0; for (let v = 0; v < 512; v++) { acc += h2[v]; if (acc > N * 0.5) { hi = v; break; } }
    const span = Math.max(8, hi - lo);
    for (let i = 0; i < N; i++) { const v = Math.max(0, Math.min(255, (f[i] * 400 - lo) / span * 255)); p[4 * i] = p[4 * i + 1] = p[4 * i + 2] = v; p[4 * i + 3] = 255; }
  }
  // 읽기 크기(긴 변 픽셀)와 배치 방식: 3 = 자동 단락, 11 = 흩어진 글자
  const PASSES = [[1000, "3"], [2400, "11"]];
  async function toCanvases(blob) {
    let img;
    try { img = await createImageBitmap(blob, { imageOrientation: "from-image" }); }
    catch { img = await new Promise((res, rej) => { const i = new Image(); const u = URL.createObjectURL(blob); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = rej; i.src = u; }); }
    const long = Math.max(img.width, img.height);
    return PASSES.map(([target]) => {
      const s = Math.min(3, target / long);
      const cv = document.createElement("canvas"); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      const x = cv.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, cv.width, cv.height);
      const d = x.getImageData(0, 0, cv.width, cv.height); enhance(d.data, cv.width, cv.height); x.putImageData(d, 0, 0);
      return cv;
    });
  }
  // 두 크기로 읽은 결과 합치기: 큰 글씨(이름·회사)는 작게 읽은 쪽, 작은 글씨(연락처·주소)는 크게 읽은 쪽을 우선
  const plausible = {
    name: v => /^[가-힣]{2,4}$/.test(v) ? (SURNAMES.includes(v[0]) ? 2 : 1) : /^[A-Za-z][A-Za-z .-]{2,}$/.test(v) ? 1 : 0,
    company: v => (RE_COMP_STRONG.test(v) ? 2 : 0) + (/^[가-힣()㈜&\s.A-Za-z]{2,}$/.test(v) ? 1 : 0) - (/[A-Z]{2,}\s*$/.test(v) && /[가-힣]/.test(v) ? 1 : 0),
    title: v => TITLES.includes(v) ? 2 : 0,
    dept: v => RE_DEPT.test(v) && v.length <= 15 ? 2 : v ? 1 : 0,
    mobile: v => /^01\d-\d{3,4}-\d{4}$/.test(v) ? 2 : v ? 1 : 0,
    phone: v => /^(0\d{1,2}-\d{3,4}-\d{4}|1[5689]\d{2}-\d{4})$/.test(v) ? 2 : v ? 1 : 0,
    fax: v => /^0\d{1,2}-\d{3,4}-\d{4}$/.test(v) ? 2 : v ? 1 : 0,
    email: v => RE_EMAIL.test(v) ? 2 : 0,
    address: v => (REGIONS.some(r => v.startsWith(r)) ? 2 : 0) + ((v.match(RE_ADDR) || []).length >= 2 ? 1 : 0) - ((v.match(/[A-Z]{3,}/g) || []).length),
    website: v => RE_WEB.test(v) ? 2 : 0,
  };
  // 이름 오른쪽에 작게 적힌 부서·직책만 따로 한 줄로 다시 읽기
  async function readBesideName(w, fields, words, big, ratio, bigW, bigH) {
    if (!fields.name) return null;
    const nw = (words || []).find(x => squash(clean(x.text)).includes(fields.name)); if (!nw) return null;
    const b = nw.bbox, h = (b.y1 - b.y0) * ratio;
    const left = Math.round(b.x1 * ratio + h * 0.3), top = Math.max(0, Math.round(b.y0 * ratio - h * 0.25));
    const rect = { left, top, width: Math.max(1, Math.min(bigW - left, Math.round(h * 14))), height: Math.max(1, Math.min(bigH - top, Math.round(h * 1.5))) };
    if (rect.width < h) return null;
    await w.setParameters({ tessedit_pageseg_mode: "7" });
    const t = clean((await w.recognize(big, { rectangle: rect })).data.text);
    if (!t) return null;
    const sq = squash(t), title = findTitle(t, sq);
    const rest = title ? sq.replace(title, " ").trim() : sq;
    const dm = rest.match(RE_DEPT);
    return { title, dept: dm ? dm[1].trim() : "" };
  }
  function merge(small, large) {
    const out = {};
    for (const k of Object.keys(plausible)) {
      const a = small[k] || "", b = large[k] || "", sa = a ? plausible[k](a) : -9, sb = b ? plausible[k](b) : -9;
      const preferSmall = k === "name" || k === "company";
      out[k] = sa > sb ? a : sb > sa ? b : (preferSmall ? (a || b) : (b || a));
    }
    return out;
  }

  let workerP = null, progress = null;
  async function getWorker() {
    if (!root.Tesseract) await loadScript(TESS_URL);
    if (!workerP) {
      workerP = root.Tesseract.createWorker(["kor", "eng"], 1, { logger: m => progress && progress(m) });
      workerP.catch(() => { workerP = null; });
    }
    return workerP;
  }
  const linesOf = data => (data.lines || []).filter(l => l.confidence > 25 || l.text.trim().length > 4)
    .map(l => ({ text: l.text, h: Math.max(1, l.bbox.y1 - l.bbox.y0) }));
  async function recognize(blob, onProgress) {
    progress = null;
    const w = await getWorker();
    const [small, large] = await toCanvases(blob);
    const step = (from, span) => m => onProgress && onProgress({ ...m, progress: m.status === "recognizing text" ? from + span * (m.progress || 0) : m.progress });
    await w.setParameters({ tessedit_pageseg_mode: PASSES[0][1] });
    progress = step(0, 0.4); const a = (await w.recognize(small)).data;
    await w.setParameters({ tessedit_pageseg_mode: PASSES[1][1] });
    progress = step(0.4, 0.55); const b = (await w.recognize(large)).data;
    progress = null;
    const fields = merge(parse(linesOf(a)), parse(linesOf(b)));
    try {
      progress = step(0.95, 0.05);
      const side = await readBesideName(w, fields, a.words, large, large.width / small.width, large.width, large.height);
      if (side) { if (side.title && !plausible.title(fields.title || "")) fields.title = side.title; if (side.dept && plausible.dept(fields.dept || "") < 2) fields.dept = side.dept; }
    } catch (e) { /* 보조 읽기는 실패해도 괜찮음 */ }
    progress = null;
    return { fields, text: (b.text || "").trim() };
  }

  root.CardOCR = { PASSES, parse, merge, enhance, readBesideName, plausible, recognize, fmtPhone, preload: () => getWorker().catch(() => {}) };
})(typeof window !== "undefined" ? window : globalThis);
