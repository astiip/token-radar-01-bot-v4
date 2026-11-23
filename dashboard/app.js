(function () {
  'use strict';
  var D = window.RADAR;
  if (!D || !D.rows) { document.getElementById('board').textContent = 'No radar data.'; return; }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) n.appendChild(x); });
      else if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else n.appendChild(c);
    }
    return n;
  }
  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function money2(n) {
    if (n === null || n === undefined) return '—';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
  }
  function moneySigned(n) {
    if (n === null || n === undefined) return '—';
    return (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toFixed(2);
  }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  }
  function pctClass(v) { return v === null || v === undefined ? '' : (v > 0 ? 'up' : (v < 0 ? 'down' : '')); }
  function ageText(days) {
    if (days === null || days === undefined) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function fmtMult(n) { return n === null || n === undefined ? '—' : (n >= 1 ? n.toFixed(2) : n.toFixed(2)) + 'x'; }

  var WATCH = {};
  (D.watchlist_slugs || []).forEach(function (s) { WATCH[s] = true; });

  /* ---------- state ---------- */
  var state = { q: '', cat: '', chain: '', minTvl: 0, token: 'pre', view: 'full', verdict: '', sort: 'rank', dir: 1, page: 0, detail: null, hideKin: false };
  var PAGE_SIZE = 25;
  var controlsSection = null;
  var boardSection = null;
  var wrapRef = null;

  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    h.split('&').forEach(function (p) {
      var kv = p.split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'detail') state.detail = v || null;
      if (k === 'cat') state.cat = v;
      if (k === 'q') state.q = v;
      if (k === 'verdict') state.verdict = v;
      if (k === 'view') state.view = (v === 'screened' || v === 'unresolved') ? v : 'full';
    });
  }
  function writeHash() {
    var bits = [];
    if (state.detail) bits.push('detail=' + encodeURIComponent(state.detail));
    if (state.cat) bits.push('cat=' + encodeURIComponent(state.cat));
    if (state.q) bits.push('q=' + encodeURIComponent(state.q));
    if (state.verdict) bits.push('verdict=' + encodeURIComponent(state.verdict));
    if (state.view !== 'full') bits.push('view=' + state.view);
    var h = bits.length ? '#' + bits.join('&') : '#';
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  function viewRows() {
    var isLive = state.token === 'live';
    var src = isLive ? D.live : D.rows;
    var list = [];
    var i;
    if (isLive) {
      for (i = 0; i < src.length; i++) {
        var p = src[i];
        list.push({
          rank: i + 1, slug: p.slug, name: p.name, category: p.category, chains: p.chains,
          tvl_usd: p.tvl_usd, change_7d: p.change_7d, age_days: null,
          factor: (p.mcap_usd && p.tvl_usd > 0) ? p.mcap_usd / p.tvl_usd : null,
          value: p.mcap_usd, low: null, high: null, ticket: '', slice: null, net: null, verdict: null, isLive: true, row: null
        });
      }
    } else {
      for (i = 0; i < src.length; i++) {
        var r = src[i];
        list.push({
          rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains,
          tvl_usd: r.tvl_usd, change_7d: r.change_7d, age_days: r.age_days,
          factor: r.category_factor, value: r.implied_value_usd, low: r.implied_low_usd, high: r.implied_high_usd,
          ticket: r.farm_ticket || '',
          slice: r.slice_usd, net: r.net_per_hour_usd, verdict: r.verdict, isLive: false, row: r
        });
      }
    }
    var q = state.q.trim().toLowerCase();
    list = list.filter(function (v) {
      if (!isLive && v.row) {
        if (state.hideKin && v.row.kin_applied) return false;
        if (state.view === 'screened' && (isFlagged(v.slug) || isUnresolved(v.slug))) return false;
        if (state.view === 'unresolved' && !isUnresolved(v.slug)) return false;
        if (state.verdict && v.verdict !== state.verdict) return false;
      }
      if (state.cat && v.category !== state.cat) return false;
      if (state.chain && (!v.chains || v.chains.indexOf(state.chain) < 0)) return false;
      if (state.minTvl && !(v.tvl_usd >= state.minTvl)) return false;
      if (q && (v.name.toLowerCase().indexOf(q) < 0 && v.slug.toLowerCase().indexOf(q) < 0 &&
          (v.category || '').toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av === null || av === undefined) av = -Infinity;
      if (bv === null || bv === undefined) bv = -Infinity;
      if (av === bv) return a.rank - b.rank;
      return (av < bv ? -1 : 1) * state.dir;
    });
    return list;
  }

  function rowBySlug(slug) {
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) return D.rows[i];
    return null;
  }
  function isFlagged(slug) {
    return !!(D.eligibility && D.eligibility[slug] && D.eligibility[slug].status === 'flag');
  }
  function isUnresolved(slug) {
    return !!(D.eligibility && D.eligibility[slug] && D.eligibility[slug].status === 'unresolved');
  }
  function screenedRows() {
    return D.rows.filter(function (r) { return !isFlagged(r.slug) && !isUnresolved(r.slug); });
  }
  function unresolvedRows() {
    return D.rows.filter(function (r) { return isUnresolved(r.slug); });
  }

  /* ---------- sections ---------- */
  function renderTopbar(wrap) {
    wrap.appendChild(el('div', { 'class': 'topbar' },
      el('div', { 'class': 'logo' }, el('span', { 'class': 'logo-dot', text: '◉' }), ' TOKEN RADAR'),
      el('div', { 'class': 'topbar-meta', text: 'Snapshot ' + D.as_of + ' · DefiLlama protocol index · ' + D.model_version + ' model' })));
  }

  /* The fitted curve as an inline SVG: the 128 live tokens as dots, the fitted line, and the
     x3 band the backtest measures. Geometry is fixed; the data comes from D.curve. */
  function renderScatter() {
    var c = D.curve;
    var W = 440, H = 110, L = 46, R = 12, T = 14, B = 26;
    var x0 = 6, x1 = 10, y0 = 4.5, y1 = 10.5;
    function X(v) { return L + (v - x0) / (x1 - x0) * (W - L - R); }
    function Y(v) { return T + (y1 - v) / (y1 - y0) * (H - T - B); }
    var s = '';
    [6, 8, 10].forEach(function (v) {
      s += '<line x1="' + X(v).toFixed(1) + '" y1="' + T + '" x2="' + X(v).toFixed(1) + '" y2="' + (H - B) + '" stroke="#2a3140" stroke-width="1"/>';
      s += '<text x="' + X(v).toFixed(1) + '" y="' + (H - 14) + '" fill="#7d8798" font-size="10" text-anchor="middle">$' + (v === 6 ? '1M' : v === 8 ? '100M' : '10B') + '</text>';
    });
    [5, 7, 9].forEach(function (v) {
      s += '<line x1="' + L + '" y1="' + Y(v).toFixed(1) + '" x2="' + (W - R) + '" y2="' + Y(v).toFixed(1) + '" stroke="#2a3140" stroke-width="1"/>';
      s += '<text x="' + (L - 5) + '" y="' + (Y(v) + 3.5).toFixed(1) + '" fill="#7d8798" font-size="10" text-anchor="end">$' + (v === 5 ? '100K' : v === 7 ? '10M' : '1B') + '</text>';
    });
    var band = Math.log10(3);
    [[-band, '4d5a6c'], [band, '4d5a6c']].forEach(function (b) {
      var yA = c.intercept + c.slope * x0 + b[0], yB = c.intercept + c.slope * x1 + b[0];
      s += '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(yA).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(yB).toFixed(1) + '" stroke="#' + b[1] + '" stroke-width="1.2" stroke-dasharray="4 4"/>';
    });
    var yA = c.intercept + c.slope * x0, yB = c.intercept + c.slope * x1;
    s += '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(yA).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(yB).toFixed(1) + '" stroke="#f5b942" stroke-width="3"/>';
    (c.points || []).forEach(function (p) {
      s += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="2.6" fill="#8a97a8" opacity="0.8"/>';
    });
    s += '<text x="' + (L + 2) + '" y="' + (T + 10) + '" fill="#7d8798" font-size="10">market cap, log scale</text>';
    s += '<text x="' + ((W - R + L) / 2).toFixed(1) + '" y="' + (H - 2) + '" fill="#7d8798" font-size="10" text-anchor="middle">TVL, log scale</text>';
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Fitted curve: market cap against TVL for the snapshot\'s live tokens">' + s + '</svg>';
    return el('div', { 'class': 'scatter' },
      el('div', { 'class': 'scatter-title', text: 'HOW A LAUNCH IS PRICED' }),
      el('div', { html: svg }),
      el('div', { 'class': 'scatter-formula', text: 'value = 10^' + c.intercept.toFixed(2) + ' × TVL^' + c.slope.toFixed(2) + ' × category × growth × maturity × breadth × kin' }),
      el('div', { 'class': 'scatter-foot', text: c.n + ' live tokens · R² ' + c.r2.toFixed(2) + ' · LOO ' + D.loo.within3 + '% within ×3 · Time-split ×' + D.time_split.median_x + ' (' + D.time_split.within3 + '% within ×3, flat ×' + D.time_split.flat_median_x + ')' }));
  }

  function renderHero(wrap) {
    var total = D.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var hero = el('header', { 'class': 'hero' },
      el('div', { 'class': 'hero-left' },
        el('h1', {}, 'Which launch is worth farming next — priced off the tokens that already trade.'),
        el('p', { 'class': 'lede', text: 'Every protocol the feed tracks that records no token, priced off the ones that do — curve, category peers, growth, age, breadth, and a kin cut when a related token trades.' })),
      el('div', { 'class': 'hero-right' }, renderScatter())
    );
    var strip = el('div', { 'class': 'strip' },
      el('div', { 'class': 'chip' }, el('div', { 'class': 'value num', text: String(D.board_size) }), el('div', { 'class': 'label', text: 'ranked' }), el('div', { 'class': 'sub', text: D.watchlist_size + ' watchlist · ' + D.early_size + ' early' })),
      el('div', { 'class': 'chip' }, el('div', { 'class': 'value num', text: D.watchlist_size + ' / ' + D.watchlist_size }), el('div', { 'class': 'label', text: 'watchlist covered' })),
      el('div', { 'class': 'chip' }, el('div', { 'class': 'value num', text: String(D.early_size) }), el('div', { 'class': 'label', text: 'early finds' }), el('div', { 'class': 'sub', text: 'below the floor — the radar’s job' })),
      el('div', { 'class': 'chip' }, el('div', { 'class': 'value num', text: String(D.token_on_record) }), el('div', { 'class': 'label', text: 'token on record' }), el('div', { 'class': 'sub', text: D.curve.n + ' of them price the curve' })),
      el('div', { 'class': 'chip' }, el('div', { 'class': 'value num', text: String(D.set_aside) }), el('div', { 'class': 'label', text: 'set aside' }), el('div', { 'class': 'sub', text: 'wrapped, staked, bridged, versioned' })),
      el('div', { 'class': 'chip' }, el('div', { 'class': 'value num', text: String(D.verdict_counts.farm) }), el('div', { 'class': 'label', text: 'FARM at $1,000 a plan' }), el('div', { 'class': 'sub', text: D.verdict_counts.thin + ' thin · ' + D.verdict_counts.skip + ' skip' })),
      el('div', { 'class': 'chip' }, el('div', { 'class': 'value num gold', text: money(total) }), el('div', { 'class': 'label', text: 'total implied value' }))
    );
    wrap.appendChild(hero);
    wrap.appendChild(strip);
  }

  function renderControls(container) {
    container.innerHTML = '';
    var cats = [];
    var chains = [];
    D.rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    });
    cats.sort();
    chains.sort();

    var q = el('input', { type: 'search', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search protocols' });
    q.addEventListener('input', function () { state.q = q.value; state.page = 0; writeHash(); renderTable(boardSection); });

    var catSel = el('select', { 'aria-label': 'Filter by category' });
    catSel.appendChild(el('option', { value: '', text: 'All categories' }));
    cats.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    catSel.value = state.cat;
    catSel.addEventListener('change', function () { state.cat = catSel.value; state.page = 0; writeHash(); renderTable(boardSection); });

    var chainSel = el('select', { 'aria-label': 'Filter by chain' });
    chainSel.appendChild(el('option', { value: '', text: 'All chains' }));
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; state.page = 0; renderTable(boardSection); });

    var tvlSel = el('select', { 'aria-label': 'Minimum TVL' });
    [[0, 'All TVL'], [50000000, '≥ $50M'], [100000000, '≥ $100M'], [250000000, '≥ $250M'], [500000000, '≥ $500M'], [1000000000, '≥ $1B']].forEach(function (o) {
      tvlSel.appendChild(el('option', { value: String(o[0]), text: o[1] }));
    });
    tvlSel.value = String(state.minTvl);
    tvlSel.addEventListener('change', function () { state.minTvl = Number(tvlSel.value); state.page = 0; renderTable(boardSection); });

    var verdictSel = el('select', { 'aria-label': 'Filter by verdict at $1,000 a plan' });
    [['', 'Any verdict'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']].forEach(function (o) {
      verdictSel.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    verdictSel.value = state.verdict;
    verdictSel.addEventListener('change', function () { state.verdict = verdictSel.value; state.page = 0; renderTable(boardSection); });

    var preBtn = el('button', { 'class': 'seg-btn' + (state.token === 'pre' ? ' active' : ''), text: 'Pre-token' });
    var liveBtn = el('button', { 'class': 'seg-btn' + (state.token === 'live' ? ' active' : ''), text: 'Live token' });
    preBtn.addEventListener('click', function () {
      if (state.token !== 'pre') { state.token = 'pre'; state.page = 0; state.sort = 'rank'; state.dir = 1; renderControls(controlsSection); renderTable(boardSection); }
    });
    liveBtn.addEventListener('click', function () {
      if (state.token !== 'live') { state.token = 'live'; state.page = 0; state.sort = 'rank'; state.dir = 1; state.detail = null; writeHash(); renderControls(controlsSection); renderTable(boardSection); renderDetail(wrapRef); }
    });
    var seg = el('div', { 'class': 'seg' }, preBtn, liveBtn);

    var verBtn = el('button', { 'class': 'seg-btn' + (state.view === 'screened' ? ' active' : ''), text: 'Verified' });
    var unresBtn = el('button', { 'class': 'seg-btn' + (state.view === 'unresolved' ? ' active' : ''), text: 'Unresolved' });
    var fullBtn = el('button', { 'class': 'seg-btn' + (state.view === 'full' ? ' active' : ''), text: 'Full board' });
    if (state.token === 'live') { verBtn.disabled = true; unresBtn.disabled = true; fullBtn.disabled = true; }
    verBtn.addEventListener('click', function () {
      if (state.view !== 'screened') { state.view = 'screened'; state.page = 0; renderControls(controlsSection); renderTable(boardSection); }
    });
    unresBtn.addEventListener('click', function () {
      if (state.view !== 'unresolved') { state.view = 'unresolved'; state.page = 0; renderControls(controlsSection); renderTable(boardSection); }
    });
    fullBtn.addEventListener('click', function () {
      if (state.view !== 'full') { state.view = 'full'; state.page = 0; renderControls(controlsSection); renderTable(boardSection); }
    });
    var verSeg = el('div', { 'class': 'seg' }, verBtn, unresBtn, fullBtn);

    var kinBtn = el('button', { 'class': 'seg-btn' + (state.hideKin ? ' active' : ''), text: state.hideKin ? 'Show kin rows' : 'Hide kin rows' });
    if (state.token === 'live') kinBtn.disabled = true;
    kinBtn.addEventListener('click', function () {
      state.hideKin = !state.hideKin; state.page = 0;
      renderControls(controlsSection); renderTable(boardSection);
    });

    var clearBtn = el('button', { 'class': 'clear-btn', text: 'Clear filters' });
    clearBtn.addEventListener('click', function () {
      state.q = ''; state.cat = ''; state.chain = ''; state.minTvl = 0; state.token = 'pre'; state.view = 'full'; state.verdict = '';
      state.sort = 'rank'; state.dir = 1; state.page = 0; state.detail = null; state.hideKin = false;
      writeHash();
      renderControls(controlsSection);
      renderTable(boardSection);
      renderDetail(wrapRef);
    });

    container.appendChild(el('div', { 'class': 'controls' }, q, catSel, chainSel, tvlSel, verdictSel, seg, verSeg, kinBtn, clearBtn));
  }

  function renderTable(container) {
    container.innerHTML = '';
    var isLive = state.token === 'live';
    var rows = viewRows();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page >= pages) state.page = pages - 1;
    var pageRows = rows.slice(state.page * PAGE_SIZE, state.page * PAGE_SIZE + PAGE_SIZE);
    var maxVal = 0;
    rows.forEach(function (v) { if (v.value && v.value > maxVal) maxVal = v.value; });

    var caption = el('p', { 'class': 'table-caption', text: isLive
      ? 'Live-token protocols at their market value, largest first. These already trade — they set the curve, they are not launches.'
      : (state.view === 'screened'
        ? 'Verified pre-token protocols, strongest implied value first. Ranks follow the full 198-row board — flagged and unresolved rows are hidden in this view.'
        : (state.view === 'unresolved'
          ? 'Unresolved rows: a related token exists but the check could not confirm it is this protocol’s own. Set aside from the verified view; read the note and judge for yourself.'
          : 'Strongest implied value first — all 198 rows, all 40 watchlist protocols. Slice is what $1,000 would hold at a 10% depositor share; the verdict is the net after gas and a 4% T-bill. ⚑ token already trades; ? unresolved; KIN 0.5× = related token trades, value halved. Select a row for its model and farm plan.')) });
    var shown = el('p', { 'class': 'rows-shown', text: rows.length + (isLive ? ' live protocols shown' : ' rows shown') });
    container.appendChild(el('div', { 'class': 'cap-row' }, caption, shown));

    var table = el('table', { 'class': 'board' });
    var valueLabel = isLive ? 'Market cap' : 'Implied value';
    var headRow = el('tr', {});
    [['rank', 'Rank'], ['name', 'Protocol'], ['tvl_usd', 'TVL'], ['change_7d', '7d'], ['age_days', 'No token for'], ['factor', 'Factor'], ['value', valueLabel], ['low', 'Range'], ['slice', 'Slice / $1K'], ['net', 'Verdict'], ['ticket', 'Farm ticket']].forEach(function (c) {
      var sortable = c[0] !== 'name' && c[0] !== 'ticket';
      var th = el('th', { text: c[1] + (state.sort === c[0] ? (state.dir === 1 ? ' ▲' : ' ▼') : '') });
      if (c[0] === 'tvl_usd' || c[0] === 'change_7d' || c[0] === 'age_days' || c[0] === 'factor' || c[0] === 'value' || c[0] === 'low' || c[0] === 'slice') th.className = 'num';
      if (sortable) {
        th.addEventListener('click', function () {
          if (state.sort === c[0]) state.dir = -state.dir;
          else { state.sort = c[0]; state.dir = (c[0] === 'rank') ? 1 : -1; }
          renderTable(container);
        });
      } else { th.style.cursor = 'default'; }
      headRow.appendChild(th);
    });
    table.appendChild(el('thead', {}, headRow));
    var tbody = el('tbody', {});
    pageRows.forEach(function (v) {
      var tr = el('tr', { 'class': (!v.isLive && v.rank <= 3 ? 'top3' : '') + (state.detail === v.slug ? ' selected' : '') + (v.isLive ? ' nolink' : '') });
      if (!v.isLive) {
        tr.addEventListener('click', function () {
          state.detail = v.slug;
          writeHash();
          renderDetail(wrapRef);
          renderTable(container);
          var d = wrapRef.querySelector('.detail');
          if (d) d.scrollIntoView({ block: 'start' });
        });
      }
      tr.appendChild(el('td', { 'class': 'num rank', text: String(v.rank) }));
      var sub = (v.category || 'Uncategorized') + ((v.chains && v.chains.length) ? ' on ' + v.chains.slice(0, 2).join(', ') + (v.chains.length > 2 ? ' +' + (v.chains.length - 2) : '') : '');
      var eligStatus = (!v.isLive && D.eligibility && D.eligibility[v.slug]) ? D.eligibility[v.slug].status : null;
      var flag = eligStatus === 'flag';
      var unres = eligStatus === 'unresolved';
      var isKin = !v.isLive && v.row && v.row.kin_applied;
      var nameCell = el('td', {},
        el('span', { 'class': 'proto-name', text: v.name }),
        v.isLive ? null : (WATCH[v.slug] ? el('span', { 'class': 'badge-watch', text: 'Watchlist' }) : el('span', { 'class': 'badge-early', text: 'Early' })),
        flag ? el('span', { 'class': 'flag-tag', text: '⚑ Token already trades' }) : null,
        unres ? el('span', { 'class': 'unres-tag', text: '? Unresolved — see note' }) : null,
        isKin ? el('span', { 'class': 'kin-tag', text: 'KIN 0.5×' }) : null,
        el('div', { 'class': 'proto-sub', text: sub }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { 'class': 'num', text: money(v.tvl_usd) }));
      tr.appendChild(el('td', { 'class': 'num ' + pctClass(v.change_7d), text: pct(v.change_7d) }));
      tr.appendChild(el('td', { 'class': 'num', text: ageText(v.age_days) }));
      tr.appendChild(el('td', { 'class': 'num', text: fmtMult(v.factor) }));
      var pctW = maxVal > 0 && v.value ? Math.max(2, Math.round(v.value / maxVal * 100)) : 0;
      var valCell = el('td', { 'class': 'num val' },
        el('div', { 'class': 'val-wrap' },
          el('div', { 'class': 'val-track' }, el('div', { 'class': 'val-fill', style: 'width:' + pctW + '%' })),
          el('span', { 'class': 'val-num', text: money(v.value) })));
      tr.appendChild(valCell);
      tr.appendChild(el('td', { 'class': 'num range', text: v.isLive ? '' : (money(v.low) + '–' + money(v.high)) }));
      tr.appendChild(el('td', { 'class': 'num', text: v.isLive ? '' : money2(v.slice) }));
      var vcell;
      if (v.isLive || !v.verdict) { vcell = el('td', { 'class': 'verdict' }); }
      else {
        var vc = v.verdict === 'FARM' ? 'vchip-farm' : (v.verdict === 'THIN' ? 'vchip-thin' : 'vchip-skip');
        vcell = el('td', { 'class': 'verdict' },
          el('span', { 'class': 'vchip ' + vc, text: v.verdict }),
          el('div', { 'class': 'vnet num ' + (v.net >= 0 ? 'up' : 'down'), text: moneySigned(v.net) + '/h' }));
      }
      tr.appendChild(vcell);
      tr.appendChild(el('td', { 'class': 'ticket', text: v.isLive ? '' : v.ticket }));
      tbody.appendChild(tr);
    });
    if (pageRows.length === 0) tbody.appendChild(el('tr', {}, el('td', { colspan: '11' }, el('div', { 'class': 'empty', text: 'No protocol matches these filters.' }))));
    table.appendChild(tbody);
    var twrap = el('div', { 'class': 'table-wrap' }, table);
    container.appendChild(twrap);
    var pager = el('div', { 'class': 'pager' });
    var prev = el('button', { text: '← Previous', disabled: state.page === 0 ? true : null });
    prev.addEventListener('click', function () { if (state.page > 0) { state.page--; renderTable(container); } });
    var next = el('button', { text: 'Next →', disabled: state.page >= pages - 1 ? true : null });
    next.addEventListener('click', function () { if (state.page < pages - 1) { state.page++; renderTable(container); } });
    pager.appendChild(el('span', { 'class': 'muted small', text: 'Page ' + (state.page + 1) + ' of ' + pages }));
    pager.appendChild(prev);
    pager.appendChild(next);
    container.appendChild(pager);
  }

  function renderDetail(wrap) {
    var old = wrap.querySelector('.detail');
    if (old) old.remove();
    if (!state.detail) return;
    var r = rowBySlug(state.detail);
    if (!r) { state.detail = null; return; }
    var base = Math.round(r.curve_value_usd * r.category_factor);
    var close = el('button', { 'class': 'detail-close', text: 'Close ×' });
    close.addEventListener('click', function () { state.detail = null; writeHash(); renderDetail(wrap); renderTable(boardSection); });
    var head = el('div', { 'class': 'detail-head' },
      el('h2', {}, '#' + r.rank + '  ' + r.name + (WATCH[r.slug] ? '  ' : '')),
      WATCH[r.slug] ? el('span', { 'class': 'badge-watch', text: 'WATCHLIST' }) : null,
      el('div', { 'class': 'implied' },
        el('div', { 'class': 'big num', text: money(r.implied_value_usd) }),
        el('div', { 'class': 'muted small', text: 'implied token value' })),
      close);
    var meta = el('p', { 'class': 'muted small', text: (r.category || 'Uncategorized') + ' · ' + (r.chains || []).join(', ') + ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) + ' · tracked since ' + (r.listed_at || 'unknown') + ' (' + ageText(r.age_days) + ') · records no token' });
    var elig = el('p', { 'class': 'eligibility', text: r.eligibility || '' });
    var factorSub = (r.category_fallback
      ? (r.fallback_source === 'global' ? 'no adjustment · no parent category' : (r.fallback_source === 'family' ? 'family · thin peers, shrunk ×4' : 'via ' + r.fallback_source + ' · ' + r.category_peers + ' peers'))
      : r.category_peers + ' peers') + ' · median actual / curve';
    var breakdown = el('div', { 'class': 'breakdown' },
      el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Curve · fitted value' }), el('div', { 'class': 'value num', text: money(r.curve_value_usd) }), el('div', { 'class': 'sub', text: '10^' + D.curve.intercept.toFixed(2) + ' × TVL^' + D.curve.slope.toFixed(2) })),
      el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Category factor' }), el('div', { 'class': 'value num', text: fmtMult(r.category_factor) }), el('div', { 'class': 'sub', text: factorSub })),
      el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Base · curve × factor' }), el('div', { 'class': 'value num', text: money(base) }), el('div', { 'class': 'sub', text: fmtMult(r.effective_multiple) + ' of TVL' })),
      el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Growth' }), el('div', { 'class': 'value num', text: fmtMult(r.growth_multiplier) }), el('div', { 'class': 'sub', text: pct(r.change_7d) + ' over 7 days' })),
      el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Maturity' }), el('div', { 'class': 'value num', text: fmtMult(r.maturity_multiplier) }), el('div', { 'class': 'sub', text: ageText(r.age_days) + ' with no token' })),
      el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Breadth' }), el('div', { 'class': 'value num', text: fmtMult(r.breadth_multiplier) }), el('div', { 'class': 'sub', text: (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') })),
      el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Kin · related token' }), el('div', { 'class': 'value num', text: fmtMult(r.kin_multiplier) }), el('div', { 'class': 'sub', text: r.kin_applied ? 'related token trades — value halved' : 'no related token trading' })),
      el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Implied' }), el('div', { 'class': 'value num', text: money(r.implied_value_usd) }), el('div', { 'class': 'sub', text: 'base × growth × maturity × breadth × kin' }))
    );
    var range = el('p', { 'class': 'range-line', html: 'Sensitivity range <b>' + money(r.implied_low_usd) + ' – ' + money(r.implied_high_usd) + '</b> (implied × ' + D.band.low_factor.toFixed(2) + ' to × ' + D.band.high_factor.toFixed(2) + ', the fitted P25–P75 band of the leave-one-out residuals).' });
    var audit = (D.eligibility && D.eligibility[r.slug]) || null;
    var auditBox = audit ? el('div', { 'class': 'audit ' + (audit.status === 'flag' ? 'audit-flag' : (audit.status === 'unresolved' ? 'audit-unresolved' : 'audit-ok')) },
      el('div', { 'class': 'audit-title', text: (audit.status === 'flag' ? '⚑ Eligibility check — flagged' : (audit.status === 'unresolved' ? '? Eligibility check — unresolved' : '✓ Eligibility check — no token found')) + ' · checked ' + D.eligibility_date }),
      el('p', { text: audit.note })) : null;
    var txs = 4 + Math.ceil(r.hold_days / 7);
    var gas = txs > 0 ? r.fees_usd / txs : 0;
    var forgone = 1000 * 0.04 * r.hold_days / 365;
    var vcls = r.verdict === 'FARM' ? 'vchip-farm' : (r.verdict === 'THIN' ? 'vchip-thin' : 'vchip-skip');
    var verdictBox = el('div', { 'class': 'verdict-box' },
      el('h3', {}, 'Verdict at a $1,000 plan ', el('span', { 'class': 'vchip ' + vcls, text: r.verdict })),
      el('div', { 'class': 'breakdown' },
        el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Slice · what $1,000 holds' }), el('div', { 'class': 'value num', text: money2(r.slice_usd) }), el('div', { 'class': 'sub', text: '10% of the launch, pro rata on TVL' })),
        el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Fees · gas on ' + r.plan_chain }), el('div', { 'class': 'value num', text: money2(r.fees_usd) }), el('div', { 'class': 'sub', text: txs + ' txs × $' + gas.toFixed(2) })),
        el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Forgone · 4% T-bill' }), el('div', { 'class': 'value num', text: money2(forgone) }), el('div', { 'class': 'sub', text: r.hold_days + ' days on $1,000' })),
        el('div', { 'class': 'break' }, el('div', { 'class': 'label', text: 'Net · slice − fees − forgone' }), el('div', { 'class': 'value num ' + (r.net_usd >= 0 ? 'up' : 'down'), text: moneySigned(r.net_usd) }), el('div', { 'class': 'sub', text: moneySigned(r.net_per_hour_usd) + ' per hands-on hour' }))
      ),
      el('p', { 'class': 'note', text: 'FARM pays at least $5 after every cost; THIN pays at all; SKIP loses to fees. The 10% share, gas table and 4% T-bill are assumptions — see the method section. Risk: ' + r.risk + '.' }));
    var farmTitle = el('h3', {}, 'How to farm it — seven steps');
    var farm = el('ol', { 'class': 'farm' });
    (r.farm_steps || []).forEach(function (s) {
      var text = s, cost = '', time = '';
      var ci = s.indexOf(' Cost: ');
      if (ci >= 0) { text = s.slice(0, ci); var rest = s.slice(ci + 7); var ti = rest.indexOf(' Time: '); if (ti >= 0) { cost = rest.slice(0, ti); time = rest.slice(ti + 7).replace(/\.$/, ''); } else { cost = rest.replace(/\.$/, ''); } }
      farm.appendChild(el('li', {},
        el('div', { text: text }),
        el('div', { 'class': 'cost-time', html: 'Cost: <b>' + esc(cost) + '</b> · Time: <b>' + esc(time) + '</b>' })));
    });
    var detail = el('section', { 'class': 'detail', 'aria-label': 'Protocol detail' }, head, meta, elig, breakdown, range, verdictBox, auditBox, farmTitle, farm);
    if (boardSection) boardSection.parentNode.insertBefore(detail, boardSection.nextSibling);
    else wrap.appendChild(detail);
  }

  /* Farm next: the five best farms by net dollars per hands-on hour, and the board's shape. */
  function renderFarmNext(wrap) {
    var fn = D.farm_next || [];
    var wl = D.farm_next_watchlist || [];
    var hist = D.histogram || [];
    var vc = D.verdict_counts || { farm: 0, thin: 0, skip: 0 };
    var total = Math.max(1, vc.farm + vc.thin + vc.skip);
    function fnRow(f) {
      return el('div', { 'class': 'fn-row' },
        el('div', { 'class': 'fn-name' },
          el('span', { 'class': 'num', text: '#' + f.rank + '  ' }),
          el('span', { text: f.name }),
          el('div', { 'class': 'fn-sub', text: f.chain + ' · slice ' + money2(f.slice_usd) + ' · fees ' + money2(f.fees_usd) + ' · ' + f.hold_days + 'd hold' })),
        el('div', { 'class': 'fn-net' },
          el('div', { 'class': 'fn-per', text: moneySigned(f.net_per_hour_usd) + '/h' }),
          el('div', { 'class': 'fn-net-total', text: 'net ' + moneySigned(f.net_usd) })));
    }
    var card = el('section', { 'class': 'card farm-next-card' },
      el('h2', {}, 'Farm next — the best pay per hands-on hour ', el('span', { 'class': 'tag', text: 'at $1,000 a plan' })),
      el('p', { 'class': 'note', text: 'FARM rows of low or medium risk, ranked by net $ per hands-on hour after gas and the 4% T-bill. The giants at the top pay the least per dollar deposited — the best farms are the small ones.' })
    );
    var grid = el('div', { 'class': 'fn-grid' });
    var list = el('div', { 'class': 'fn-list' });
    fn.forEach(function (f) { list.appendChild(fnRow(f)); });
    grid.appendChild(list);
    var dist = el('div', { 'class': 'fn-dist' });
    dist.appendChild(el('h3', {}, 'Where the value sits'));
    var maxC = 0;
    hist.forEach(function (b) { if (b.count > maxC) maxC = b.count; });
    hist.forEach(function (b) {
      var w = maxC > 0 ? Math.max(2, Math.round(b.count / maxC * 100)) : 0;
      dist.appendChild(el('div', { 'class': 'hist-row' },
        el('span', { 'class': 'hist-label', text: b.label }),
        el('div', { 'class': 'hist-track' }, el('div', { 'class': 'hist-fill', style: 'width:' + w + '%' })),
        el('span', { 'class': 'hist-val num', text: String(b.count) })));
    });
    dist.appendChild(el('div', { 'class': 'splitbar' },
      el('div', { 'class': 'split-farm', style: 'width:' + (vc.farm / total * 100).toFixed(1) + '%' }),
      el('div', { 'class': 'split-thin', style: 'width:' + (vc.thin / total * 100).toFixed(1) + '%' }),
      el('div', { 'class': 'split-skip', style: 'width:' + (vc.skip / total * 100).toFixed(1) + '%' })));
    dist.appendChild(el('p', { 'class': 'split-legend', text: 'FARM ' + vc.farm + ' · THIN ' + vc.thin + ' · SKIP ' + vc.skip + ' — the SKIP rows are mostly giants whose slice is smaller than gas + T-bill.' }));
    grid.appendChild(dist);
    card.appendChild(grid);
    if (wl.length) {
      card.appendChild(el('h3', {}, 'Best per hands-on hour on the watchlist'));
      card.appendChild(el('p', { 'class': 'note', text: 'Watchlist rows only, ranked the same way.' }));
      var wlist = el('div', { 'class': 'fn-list' });
      wl.forEach(function (f) { wlist.appendChild(fnRow(f)); });
      card.appendChild(wlist);
    }
    wrap.appendChild(card);
  }

  function renderMethod(wrap) {
    var c = D.curve;
    var card = el('section', { 'class': 'card' },
      el('h2', {}, 'How the value is calculated ', el('span', { 'class': 'tag', text: 'auditable' })),
      el('div', { 'class': 'formula', html: '<b>implied</b> = curve(TVL) × <b>category factor</b> × growth × maturity × breadth × kin<br>curve: log<sub>10</sub>(mcap) = ' + c.intercept.toFixed(2) + ' + ' + c.slope.toFixed(2) + ' × log<sub>10</sub>(TVL), fitted on the snapshot’s ' + c.n + ' live tokens (R² ' + c.r2.toFixed(2) + ')<br>factor: median(actual mcap / curve) of the category’s live peers (min 3, clamp 0.25–3.00, shrunk toward 1.00 with 20 pseudo-peers; parent fallback; thin categories take a family factor (n·median + 4·1.00)/(n+4); else 1.00)<br>kin: 0.50 when a related token already trades (16 rows — 4 flagged + 12 unresolved kin rows), else 1.00<br>growth = 1 + clamp(7d change, −50%, +60%) × 0.6 · maturity = 0.70 + min(age, 1095d)/1095 × 0.45 · breadth = 1.00 / 1.03 / 1.06 / 1.10 for 1 / 2 / 3 / 4+ chains<br>low / high = implied × ' + D.band.low_factor.toFixed(2) + ' / × ' + D.band.high_factor.toFixed(2) + ' (P25–P75 of the leave-one-out residuals, fitted at build time, not fixed)' }),
      el('p', { 'class': 'note', text: 'Why a curve: a dollar of TVL is worth a different multiple at $5M than at $5B — the live median mcap/TVL falls from 0.42x below $50M to 0.03x above $1B, and all 15 live Lending peers sit below $250M, so a flat Lending median would price a $2.75B curator off peers 10–50x smaller. The curve is rough (R² ' + c.r2.toFixed(2) + '), so no row is priced off it alone — the category factor ties each row to its own peers. Leave-one-out backtest, every live token predicted blind: median error ×' + D.loo.median_x + ', ' + D.loo.within3 + '% within ×3; the flat category median misses by ×5.25 (28.9% within ×3). Time-split: the curve fitted on the ' + D.time_split.train_n + ' tokens listed before 2024 predicts the ' + D.time_split.test_n + ' listed since to a median miss of ×' + D.time_split.median_x + ' (' + D.time_split.within3 + '% within ×3, train R² ' + D.time_split.train_r2.toFixed(2) + '), vs ×' + D.time_split.flat_median_x + ' (' + D.time_split.flat_within3 + '% within ×3) for the flat median — it holds up forward in time, not just in-sample. The range is wide because the model is rough; the old fixed band (×0.5–×1.6) claimed a precision the backtest never supported.' }),
      el('p', { 'class': 'note', text: 'Radar-6 vs radar-5, same snapshot: LOO ×3.45 (45.3% within ×3) → ×' + D.loo.median_x + ' (' + D.loo.within3 + '%); time-split ×2.91 (51.0%) → ×' + D.time_split.median_x + ' (' + D.time_split.within3 + '%); R² 0.19 → ' + D.curve.r2.toFixed(2) + '. Kin halves 16 rows whose related token trades; family effects lift thin categories off the global 1.00 (Prediction Market now prices off Dexs peers). Had the new numbers not beaten the old, family effects would have reverted to radar-5 — these are measured, not claimed.' })
    );
    var table = el('table', { 'class': 'comps' });
    table.appendChild(el('thead', {}, el('tr', {},
      el('th', { text: 'Category' }), el('th', { 'class': 'num', text: 'Factor' }), el('th', { 'class': 'num', text: 'Live peers' }), el('th', { text: 'Factor from' }))));
    var tbody = el('tbody', {});
    (D.factors || []).forEach(function (f) {
      tbody.appendChild(el('tr', {},
        el('td', { text: f.category }),
        el('td', { 'class': 'num', text: fmtMult(f.factor) }),
        el('td', { 'class': 'num', text: String(f.peers) }),
        el('td', { text: f.source === null ? 'own peers' : (f.source === 'global' ? 'no adjustment (1.00)' : (f.source === 'family' ? 'family · thin peers, shrunk ×4' : 'via ' + f.source)) })));
    });
    table.appendChild(tbody);
    card.appendChild(table);
    card.appendChild(el('h3', {}, 'The verdict — what a $1,000 plan pays'));
    card.appendChild(el('p', { 'class': 'note', text: 'Every row carries a verdict at a $1,000 plan, from the snapshot’s numbers plus four stated assumptions. Slice = 10% of implied value, pro rata on a $1,000 deposit. Fees = one tx per week of the hold, plus setup, claim and unwind, at the assumed gas of the plan’s cheapest chain. Forgone = a 4% T-bill on the $1,000 over the hold. Hands-on time = 35 minutes plus 10 a week. FARM when net ≥ +$5, THIN when ≥ $0, SKIP when fees eat the drop. The plan runs on the cheapest chain; the board lists every chain it runs on.' }));
    card.appendChild(el('p', { 'class': 'note', text: 'Gas per tx, Nov 2026 (assumed, not snapshot data): ETH $4 · BTC $3 · Tron $2 · BNB $0.30 · AVAX $0.25 · Arb/OP $0.15 · Base/Ink/Monad/Polygon $0.10 · SOL/Sui/Aptos $0.05 · other $0.25. The 10% share, 4% T-bill and gas prices are assumptions — change them and the verdicts move; the formula above makes that checkable.' }));
    wrap.appendChild(card);
  }

  function renderValidation(wrap) {
    var m = D.model;
    var gLo = (1 + m.growth_floor / 100 * m.growth_weight).toFixed(2);
    var gHi = (1 + m.growth_cap / 100 * m.growth_weight).toFixed(2);
    var matLo = m.maturity_floor.toFixed(2);
    var matHi = (m.maturity_floor + m.maturity_range).toFixed(2);
    var card = el('section', { 'class': 'card' },
      el('h2', {}, 'Validation — leave one factor out ', el('span', { 'class': 'tag', text: 'no single factor decides' })),
      el('p', { 'class': 'note', text: 'Each factor below is a formula over the snapshot’s own fields, range printed. The table re-ranks the board with one factor removed at a time — if one multiplier decided the board, the top 10 would fall apart without it.' })
    );
    var ftable = el('table', { 'class': 'comps' });
    ftable.appendChild(el('thead', {}, el('tr', {},
      el('th', { text: 'Factor' }), el('th', { text: 'Formula' }), el('th', { text: 'Source fields' }), el('th', { 'class': 'num', text: 'Range' }))));
    var fbody = el('tbody', {});
    [
      ['Curve', '10^(a + b·log10 TVL), OLS on the ' + D.curve.n + ' live tokens', 'mcap_usd, tvl_usd', 'R² ' + D.curve.r2.toFixed(2)],
      ['Category factor', 'median(actual mcap / curve) of live peers in the category', 'mcap_usd, tvl_usd, category', fmtMult(m.factor_floor) + '–' + fmtMult(m.factor_cap) + ', min ' + m.min_peers + ' peers'],
      ['Family effect', '(n·median + 4·1.00)/(n+4) for thin categories with no parent', 'category, live peers', '0.25–3.00'],
      ['Growth', '1 + clamp(7d, ' + m.growth_floor + '%, +' + m.growth_cap + '%) × ' + m.growth_weight, 'change_7d', gLo + '–' + gHi],
      ['Maturity', m.maturity_floor + ' + min(age, ' + m.maturity_days + 'd)/' + m.maturity_days + ' × ' + m.maturity_range, 'listed_at, as_of', matLo + '–' + matHi + ' (unknown ' + m.unknown_age_multiplier + ')'],
      ['Breadth', '1.00 / ' + m.breadth_2 + ' / ' + m.breadth_3 + ' / ' + m.breadth_4plus, 'chains', '1.00–' + m.breadth_4plus],
      ['Kin', '0.50 when a related token already trades, else 1.00', 'eligibility audit (flag / unresolved kin)', '0.50–1.00']
    ].forEach(function (row) {
      fbody.appendChild(el('tr', {},
        el('td', { text: row[0] }), el('td', { text: row[1] }), el('td', { text: row[2] }), el('td', { 'class': 'num', text: row[3] })));
    });
    ftable.appendChild(fbody);
    card.appendChild(ftable);

    var atable = el('table', { 'class': 'comps ablation' });
    atable.appendChild(el('thead', {}, el('tr', {},
      el('th', { text: 'Protocol' }), el('th', { 'class': 'num', text: 'Full' }), el('th', { 'class': 'num', text: 'No growth' }),
      el('th', { 'class': 'num', text: 'No maturity' }), el('th', { 'class': 'num', text: 'No breadth' }), el('th', { 'class': 'num', text: 'Global factor only' }), el('th', { 'class': 'num', text: 'No kin' }))));
    var abody = el('tbody', {});
    (D.ablation || []).forEach(function (a) {
      abody.appendChild(el('tr', {},
        el('td', { text: '#' + a.full + '  ' + a.name }),
        el('td', { 'class': 'num', text: String(a.full) }),
        el('td', { 'class': 'num', text: String(a.no_growth) }),
        el('td', { 'class': 'num', text: String(a.no_maturity) }),
        el('td', { 'class': 'num', text: String(a.no_breadth) }),
        el('td', { 'class': 'num', text: String(a.global_factor) }),
        el('td', { 'class': 'num', text: String(a.no_kin) })));
    });
    atable.appendChild(abody);
    card.appendChild(atable);

    var keys = ['no_growth', 'no_maturity', 'no_breadth', 'global_factor', 'no_kin'];
    var labels = { no_growth: 'no growth', no_maturity: 'no maturity', no_breadth: 'no breadth', global_factor: 'global factor only', no_kin: 'no kin' };
    var top5Stable = (D.ablation || []).slice(0, 5).every(function (a) { return keys.every(function (k) { return a[k] <= 5; }); });
    var stays = keys.map(function (k) { return (D.ablation || []).filter(function (a) { return a[k] <= 10; }).length; });
    var minStay = Math.min.apply(null, stays), maxStay = Math.max.apply(null, stays);
    var worst = null, worstDev = 0, worstKey = '';
    (D.ablation || []).forEach(function (a) {
      keys.forEach(function (k) {
        var dev = Math.abs(a[k] - a.full);
        if (dev > worstDev) { worstDev = dev; worst = a; worstKey = k; }
      });
    });
    var summary = (top5Stable ? 'The top 5 stay in the top 5 under every ablation. ' : '') +
      'Between ' + minStay + ' and ' + maxStay + ' of the top 10 stay in the top 10 when one factor is removed. ' +
      (worst ? 'The largest move is ' + worst.name + ': rank ' + worst.full + ' to ' + worst[worstKey] + ' with ' + labels[worstKey] + ' — the category factor matters most below the top 5.' : '');
    card.appendChild(el('p', { 'class': 'note', text: summary }));
    wrap.appendChild(card);
  }

  function renderAudit(wrap) {
    var card = el('section', { 'class': 'card' },
      el('h2', {}, 'Eligibility check — every row ', el('span', { 'class': 'tag', text: 'checked ' + D.eligibility_date })),
      el('p', { 'class': 'note', text: 'The board follows the snapshot’s record: a protocol is pre-token when its record carries no token. USDD and Bittensor dTAO are also on the house watchlist, so the gate requires them in the board. Every one of the 198 rows was matched against the CoinGecko coin list (22,247 coins) and each name match verified against CoinGecko market data on 2026-11-14. 176 rows are genuine — no token with the protocol’s name trades. 4 are flagged: the protocol’s own token already trades (USDD, Bittensor dTAO, BitFi, Doppler Finance). 18 are unresolved: a related token exists but is ambiguous — the parent chain’s token, a stablecoin or fund share, a token with no market data, or a thin market. 16 rows carry a related token that already trades (4 flagged + 12 unresolved kin rows) and their implied value is halved (kin 0.50×) — the method section states the rule. Flagged and unresolved rows are set aside from the verified view, not re-ranked. The top 10 below carry a deep check of public sources as well.' })
    );
    var table = el('table', { 'class': 'comps' });
    table.appendChild(el('thead', {}, el('tr', {},
      el('th', { text: 'Protocol' }), el('th', { text: 'Check' }), el('th', { text: 'What the check found' }))));
    var tbody = el('tbody', {});
    D.rows.slice(0, 10).forEach(function (r) {
      var a = (D.eligibility && D.eligibility[r.slug]) || null;
      tbody.appendChild(el('tr', {},
        el('td', { text: '#' + r.rank + '  ' + r.name }),
        el('td', { text: a ? (a.status === 'flag' ? '⚑ Flagged' : (a.status === 'unresolved' ? '? Unresolved' : '✓ Genuine')) : '—' }),
        el('td', { text: a ? a.note : 'Not checked.' })));
    });
    table.appendChild(tbody);
    card.appendChild(table);
    if (D.screened) {
      var vlist = el('div', { 'class': 'screened' },
        el('h3', {}, 'Verified pre-token view — one click away'),
        el('p', { 'class': 'note', text: 'The board above shows all 198 rows, flagged and unresolved rows badged. The Verified view hides the 4 flagged and 18 unresolved rows: total implied value ' + money(D.screened.total_implied_usd) + ' (set aside: ' + money(D.screened.excluded_implied_usd) + '). The top 5 that remain:' }),
        el('ol', { 'class': 'screened-top' })
      );
      var ol = vlist.querySelector('.screened-top');
      D.screened.top.forEach(function (t) {
        ol.appendChild(el('li', {}, el('span', { text: '#' + t.rank + '  ' + t.name + ' — ' }), el('span', { 'class': 'num', text: money(t.implied_value_usd) })));
      });
      card.appendChild(vlist);
    }
    if (D.unresolved && D.unresolved.rows.length) {
      var ulist = el('div', { 'class': 'unresolved' },
        el('h3', {}, 'Unresolved rows — ' + D.unresolved.count + ' set aside, judge for yourself'),
        el('p', { 'class': 'note', text: 'Not in the verified view — each has a related token the check could not confirm as this protocol’s own. Total implied value set aside: ' + money(D.unresolved.total_implied_usd) + '.' }),
        el('table', { 'class': 'comps' })
      );
      var utable = ulist.querySelector('table');
      utable.appendChild(el('thead', {}, el('tr', {},
        el('th', { text: 'Protocol' }), el('th', { text: 'Why it is unresolved' }))));
      var ubody = el('tbody', {});
      D.unresolved.rows.forEach(function (u) {
        ubody.appendChild(el('tr', {},
          el('td', { text: '#' + u.rank + '  ' + u.name }),
          el('td', { text: u.note })));
      });
      utable.appendChild(ubody);
      card.appendChild(ulist);
    }
    wrap.appendChild(card);
  }

  function renderFooter(wrap) {
    wrap.appendChild(el('footer', {},
      el('p', { text: 'Method: ' + D.model_version + '. Implied = curve(TVL) × category factor × growth × maturity × breadth × kin. Curve fitted to the snapshot’s ' + D.curve.n + ' live tokens (log10 mcap = ' + D.curve.intercept.toFixed(2) + ' + ' + D.curve.slope.toFixed(2) + ' × log10 TVL, R² ' + D.curve.r2.toFixed(2) + '); factor = median (actual mcap / curve) over the category’s live peers. Low / high = implied × the P25–P75 band of the leave-one-out residuals (×' + D.band.low_factor.toFixed(2) + ' to ×' + D.band.high_factor.toFixed(2) + '). Snapshot sealed: DefiLlama public API, fetched ' + D.as_of + '. “Records no token” means no market cap, CoinGecko id or symbol in its record — not proof it has none. Farm plans are this radar’s reading of each protocol’s own record; rewards unconfirmed; nothing here is financial advice.' }),
      el('p', { text: 'Board: ' + D.board_size + ' rows (' + screenedRows().length + ' verified, ' + unresolvedRows().length + ' unresolved) · watchlist ' + D.watchlist_size + ' · live set aside ' + D.live_size + ' · data as of ' + D.as_of + '.' })));
  }

  /* ---------- boot ---------- */
  readHash();
  var main = document.getElementById('board');
  main.setAttribute('aria-busy', 'false');
  var wrap = el('div', { 'class': 'wrap' });
  main.appendChild(wrap);
  wrapRef = wrap;
  renderTopbar(wrap);
  renderHero(wrap);
  controlsSection = el('div', { 'class': 'controls-section' });
  wrap.appendChild(controlsSection);
  renderControls(controlsSection);
  boardSection = el('div', { 'class': 'board-section' });
  wrap.appendChild(boardSection);
  renderTable(boardSection);
  renderDetail(wrap);
  renderFarmNext(wrap);
  renderMethod(wrap);
  renderValidation(wrap);
  renderAudit(wrap);
  renderFooter(wrap);
  if (state.detail) {
    var d = wrap.querySelector('.detail');
    if (d) d.scrollIntoView({ block: 'start' });
  }
  window.addEventListener('hashchange', function () {
    readHash();
    renderControls(controlsSection);
    renderTable(boardSection);
    renderDetail(wrap);
  });
})();
