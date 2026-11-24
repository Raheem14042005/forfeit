// FORFEIT host: runs on the big screen (laptop, TV, or a shared screen on a call).
// The host owns all game state. Phones are thin controllers that render the "views" it sends.
window.FF = window.FF || {};
(function () {
  const U = FF.u, A = FF.audio, esc = U.esc;
  const H = FF.host = {};
  const ABORT = { abort: true };
  const MIN = 3, MAX = 10;
  const params = new URLSearchParams(location.search);
  const SPEED = params.has('fast') ? 0.15 : 1;

  const MODES = {
    likely: { name: 'Most Likely To', icon: '👉', color: '#ffd400', rule: 'Vote for the mate who fits best. Vote with the room to score.' },
    snake: { name: 'Snake', icon: '🐍', color: '#22d37a', rule: 'Everyone gets the secret word except the snake. Drop a one word clue, then find the snake.' },
    hot: { name: 'Hot Take', icon: '🌶️', color: '#ff3b4a', rule: 'Rate the take from 0 to 10. Then guess what one mate put.' },
    wrote: { name: 'Who Wrote That?', icon: '✍️', color: '#2d7dff', rule: 'Write something funny. Then guess who wrote each one.' },
  };
  const DEFAULTS = { length: 8, ball: true, uni: true, spicy: false, family: false, forfeits: true, bleep: false, music: true };
  const TOGGLES = [
    ['ball', 'Football pack ⚽'], ['uni', 'School and uni pack 🎓'], ['spicy', 'Spicy pack 16+ 🌶️'], ['family', 'Family mode 🏡'],
    ['forfeits', 'Forfeits 💀'], ['bleep', 'Bleep swears 🤐'], ['music', 'Lobby music 🎵'],
  ];
  const BOT_NAMES = ['Bot Barry', 'Bot Aoife', 'Bot Dev', 'Bot Priya', 'Bot Kwame', 'Bot Chloe', 'Bot Liam', 'Bot Zara', 'Bot Cian', 'Bot Mo'];
  const BOT_LINES = ['My nan', 'A suspiciously big sandwich', 'Absolutely nothing, I panicked', 'The group chat at 3am', 'A strongly worded email', 'Pigeons', 'My last two brain cells', 'A free trial I forgot to cancel', 'Crying in the car park', 'A haunted microwave', 'Bringing my mam', 'Sending a voice note'];

  const G = H.G = {
    code: null, online: false, netError: null, net: null,
    players: [], phase: 'boot', token: 0, seq: 0,
    settings: null, collecting: null, timer: null,
    round: 0, rounds: 8, used: {},
  };

  // ---------- flow helpers ----------
  async function W(p) { const tok = G.token; const r = await p; if (tok !== G.token) throw ABORT; return r; }
  async function wait(ms) { const tok = G.token; await U.sleep(ms * SPEED); if (tok !== G.token) throw ABORT; }
  const byId = id => G.players.find(p => p.id === id);
  const active = () => G.players.filter(p => p.bot || p.connected);
  const humans = () => G.players.filter(p => !p.bot);
  const optOf = p => ({ id: p.id, label: p.name, avatar: p.avatar, color: p.color });
  const blankStats = () => ({ heat: 0, snake: 0, mind: 0, fools: 0, seat: 0 });
  const stage = () => U.$('#stage');
  function show(html) { const s = stage(); if (s) { s.innerHTML = html; s.scrollTop = 0; } updateStrip(); }
  const head = M => '<div class="modechip" style="--c:' + M.color + '">' + M.icon + ' ' + esc(M.name) + '</div>';
  const timerHtml = () => '<div class="timerrow"><div class="timer" id="timer"><i></i></div><div class="timenum" id="timenum"></div><button class="btn small ghost" data-act="skip">Skip</button></div>';
  const spot = (list, label) => '<div class="spot">' + '<div style="display:flex;gap:14px;justify-content:center">' + list.map(p => U.avatar(p, 'lg')).join('') + '</div><div class="name">' + list.map(p => esc(p.name)).join(' + ') + '</div>' + (label ? '<div class="sub">' + label + '</div>' : '') + '</div>';

  function award(p, pts, why) { p.score += pts; p.delta += pts; return { p, pts, why }; }
  function gainsHtml(gains, title) {
    if (!gains.length) return '<div class="sub">Nobody scored this time.</div>';
    return (title ? '<div class="sub">' + esc(title) + '</div>' : '') + '<div class="gains">' + gains.map((g, i) =>
      '<div class="gain" style="animation-delay:' + (i * 0.08) + 's">' + U.avatar(g.p, 'sm') + '<span class="heavy">' + esc(g.p.name) + '</span><b class="' + (g.pts < 0 ? 'neg' : '') + '">' + (g.pts > 0 ? '+' : '') + g.pts + '</b></div>').join('') + '</div>';
  }

  // ---------- views to phones ----------
  function sendView(p, v) {
    p.view = v;
    if (p.bot || !p.conn || !G.net) return;
    G.net.send(p.conn, { t: 'view', v: Object.assign({ you: { name: p.name, avatar: p.avatar, color: p.color, score: p.score, vip: !!p.vip } }, v) });
  }
  const eyesUp = list => list.forEach(p => sendView(p, { type: 'wait', msg: '👀 Eyes on the big screen' }));
  function lobbyViews() { G.players.forEach(p => sendView(p, { type: 'lobby', count: active().length, min: MIN, vip: !!p.vip })); }

  // ---------- collecting answers ----------
  function collect(o) {
    return new Promise(resolve => {
      const c = { id: o.id + '#' + (++G.seq), expected: o.players.map(p => p.id), answers: {}, validate: o.validate, doneMsg: o.doneMsg };
      let over = false;
      G.collecting = c;
      c.finish = () => {
        if (over) return;
        over = true;
        stopTimer();
        if (G.collecting === c) G.collecting = null;
        eyesUp(o.players);
        updateStrip();
        resolve(c.answers);
      };
      c.check = () => {
        const waiting = c.expected.some(id => { const p = byId(id); return p && c.answers[id] === undefined && (p.bot || p.connected); });
        if (!waiting) setTimeout(c.finish, 500 * SPEED);
      };
      o.players.forEach(p => {
        sendView(p, Object.assign({ id: c.id }, o.view(p)));
        if (p.bot) setTimeout(() => { if (G.collecting === c) receive(p, c.id, o.bot(p)); }, (1200 + Math.random() * 5200) * SPEED);
      });
      startTimer(o.seconds, c.finish);
      updateStrip();
      c.check();
    });
  }

  function receive(p, id, a) {
    const c = G.collecting;
    if (!c || c.id !== id || !c.expected.includes(p.id) || c.answers[p.id] !== undefined) return;
    const v = c.validate ? c.validate(p, a) : a;
    if (v === undefined) return;
    c.answers[p.id] = v;
    A.play('lock');
    sendView(p, { type: 'done', msg: c.doneMsg || 'Locked in!' });
    updateStrip();
    c.check();
  }

  const vText = max => (p, a) => { const s = U.clean(typeof a === 'string' ? a : '', G.settings.bleep).slice(0, max); return s ? s : undefined; };
  const vChoice = allowed => (p, a) => (allowed(p).some(o => o.id === a) ? a : undefined);
  const vSlider = (p, a) => { const n = Math.round(Number(a)); return Number.isFinite(n) && n >= 0 && n <= 10 ? n : undefined; };

  // ---------- timer ----------
  function startTimer(sec, onEnd) {
    stopTimer();
    if (!sec) return;
    const total = sec * 1000 * SPEED;
    const t = G.timer = { end: Date.now() + total, total, onEnd, last: null };
    const tick = () => {
      if (G.timer !== t) return;
      const left = Math.max(0, t.end - Date.now());
      const bar = U.$('#timer'), num = U.$('#timenum');
      const secs = Math.ceil(left / 1000 / SPEED);
      if (bar) { bar.querySelector('i').style.transform = 'scaleX(' + (left / total) + ')'; bar.classList.toggle('low', secs <= 5); }
      if (num) num.textContent = secs;
      if (secs <= 5 && secs > 0 && secs !== t.last) A.play('tick');
      t.last = secs;
      if (left <= 0) { stopTimer(); onEnd(); }
    };
    t.iv = setInterval(tick, 100);
    tick();
  }
  function stopTimer() { if (G.timer) { clearInterval(G.timer.iv); G.timer = null; } }

  // ---------- content ----------
  const FALLBACK = {
    snake: [{ cat: 'Food', fam: true, words: ['Pizza', 'Curry', 'Toast', 'Chips', 'Soup', 'Cheese'] }, { cat: 'Animals', fam: true, words: ['Penguin', 'Shark', 'Pigeon', 'Horse', 'Owl', 'Frog'] }],
    likely: [{ t: 'Who is most likely to fall asleep at the party?', p: 'core', fam: true }, { t: 'Who is most likely to go viral by accident?', p: 'core', fam: true }],
    hot: [{ t: 'Cereal is a soup.', p: 'core', fam: true }, { t: 'Voice notes over two minutes should be illegal.', p: 'core', fam: true }],
    wrote: [{ t: 'The worst thing to say at a job interview', p: 'core', fam: true }, { t: 'A terrible name for a pet goldfish', p: 'core', fam: true }],
    forfeits: [{ t: 'Talk like a posh news reader until the next game starts.', p: 'core', fam: true }, { t: 'Do your best impression of the winner.', p: 'core', fam: true }],
  };
  function pool(kind) {
    const all = (FF.content && FF.content[kind] && FF.content[kind].length) ? FF.content[kind] : FALLBACK[kind];
    const s = G.settings;
    let items = s.family ? all.filter(i => i.fam) : all.filter(i => !i.p || i.p === 'core' || (i.p === 'ball' && s.ball) || (i.p === 'uni' && s.uni) || (i.p === 'spicy' && s.spicy));
    return items.length ? items : all;
  }
  function draw(kind, keyOf) {
    keyOf = keyOf || (i => i.t);
    const items = pool(kind);
    const used = G.used[kind] || (G.used[kind] = new Set());
    let fresh = items.filter(i => !used.has(keyOf(i)));
    if (!fresh.length) { used.clear(); fresh = items; }
    const it = U.pick(fresh);
    used.add(keyOf(it));
    return it;
  }

  // ---------- shell, strip, lobby ----------
  function renderShell() {
    U.$('#app').innerHTML =
      '<div class="host">' +
      '<div class="topbar"><div class="logo small">FORFEIT<span class="bang">!</span></div>' +
      '<div class="right"><div class="roomtag" id="roomtag"></div><button class="btn small ghost" data-act="mute" id="mutebtn">🔊</button><button class="btn small ghost hidden" data-act="quit" id="quitbtn">Lobby</button></div></div>' +
      '<div class="stage" id="stage"></div>' +
      '<div class="strip" id="strip"></div></div>';
    U.$('#app').addEventListener('click', onClick);
  }

  function updateTop() {
    const tag = U.$('#roomtag');
    if (tag) tag.innerHTML = G.code ? 'JOIN CODE <b>' + G.code + '</b>' : (G.netError ? 'OFFLINE' : 'CONNECTING');
    const q = U.$('#quitbtn');
    if (q) q.classList.toggle('hidden', G.phase === 'lobby' || G.phase === 'boot');
    const m = U.$('#mutebtn');
    if (m) m.textContent = A.muted ? '🔇' : '🔊';
  }

  function updateStrip() {
    updateTop();
    const el = U.$('#strip');
    if (!el) return;
    if (G.phase === 'lobby' || G.phase === 'boot') { el.innerHTML = ''; return; }
    const c = G.collecting;
    el.innerHTML = G.players.map(p => {
      const done = c && c.answers[p.id] !== undefined;
      const waiting = c && c.expected.includes(p.id) && !done;
      return '<div class="chip ' + (p.bot || p.connected ? '' : 'off') + (done ? ' done' : '') + '">' + U.avatar(p) +
        (done ? '<div class="badge">✓</div>' : '') +
        '<div class="name">' + esc(p.name) + '</div><div class="pts">' + (waiting ? '...' : p.score + ' pts') + '</div></div>';
    }).join('');
  }

  function joinUrl() {
    if (!/^https?:$/.test(location.protocol) || !G.code) return null;
    return location.origin + location.pathname + '?room=' + G.code;
  }

  function renderLobby() {
    G.phase = 'lobby';
    const s = G.settings, n = active().length, ok = n >= MIN;
    const url = joinUrl();
    const seats = [];
    G.players.forEach(p => seats.push('<div class="seat on">' + U.avatar(p) + '<div class="name">' + esc(p.name) + '</div>' +
      (p.vip ? '<div class="tagline">VIP 👑</div>' : p.bot ? '<div class="tagline">Bot</div>' : (p.connected ? '' : '<div class="tagline">Reconnecting</div>')) +
      '<button class="kick" data-kick="' + p.id + '">remove</button></div>'));
    for (let i = G.players.length; i < Math.max(MIN, Math.min(MAX, G.players.length + 1)) || i < 6; i++) seats.push('<div class="seat">' + (i < MIN ? 'Waiting for player' : 'Empty seat') + '</div>');
    const status = !G.code && !G.netError ? 'Connecting to the join server...' : ok ? n + ' players. Ready when you are!' : 'Need ' + (MIN - n) + ' more player' + (MIN - n === 1 ? '' : 's') + ' (3 to 10)';
    show('<div class="lobby">' +
      '<div class="panel joinbox"><h3>Join on your phone</h3>' +
      (url ? '<div class="mute">Scan or go to</div><div class="url">' + esc(url.replace(/^https?:\/\//, '')) + '</div>' : '<div class="mute">Open the FORFEIT link on your phone, tap JOIN and type this code:</div>') +
      '<div class="code">' + (G.code || '····').split('').map(ch => '<span>' + ch + '</span>').join('') + '</div>' +
      (url ? '<div class="qr" id="qr"></div>' : '') +
      (G.netError ? '<div class="warn">' + esc(G.netError) + '</div>' : '') +
      '</div>' +
      '<div><div class="panel"><div class="seats">' + seats.join('') + '</div>' +
      '<div class="lobbybar"><div class="status ' + (ok ? 'go' : '') + '">' + esc(status) + '</div><div class="hostctl">' +
      '<button class="btn small ghost" data-act="bot">+ Test bot</button><button class="btn" data-act="start" ' + (ok ? '' : 'disabled') + '>Start game</button></div></div></div>' +
      '<div class="panel" style="margin-top:18px"><div class="label">Game length</div><div class="seg">' +
      [[5, 'Quick (5 rounds)'], [8, 'Normal (8)'], [12, 'Long (12)']].map(([v, l]) => '<button data-len="' + v + '" class="' + (s.length === v ? 'on' : '') + '">' + l + '</button>').join('') +
      '</div><div class="settings">' + TOGGLES.map(([k, l]) => '<div class="toggle ' + (s[k] ? 'on' : '') + '" data-tog="' + k + '"><span>' + l + '</span><span class="sw"></span></div>').join('') + '</div></div>' +
      '</div></div>');
    if (url && window.qrcode) {
      try { const q = qrcode(0, 'M'); q.addData(url); q.make(); U.$('#qr').innerHTML = '<img alt="QR code to join" src="' + q.createDataURL(4, 0) + '">'; } catch (e) { /* no QR, the URL is shown */ }
    }
    lobbyViews();
  }

  function onClick(e) {
    A.unlock();
    const t = e.target.closest('[data-act],[data-len],[data-tog],[data-kick]');
    if (!t) return;
    const s = G.settings;
    if (t.dataset.len) { s.length = Number(t.dataset.len); saveSettings(); renderLobby(); return; }
    if (t.dataset.tog) {
      const k = t.dataset.tog;
      s[k] = !s[k];
      if (k === 'family' && s.family) s.spicy = false;
      if (k === 'spicy' && s.spicy) s.family = false;
      if (k === 'music') A.music(s.music && G.phase === 'lobby');
      saveSettings(); renderLobby(); return;
    }
    if (t.dataset.kick) { removePlayer(byId(t.dataset.kick), 'The host removed you.'); return; }
    const act = t.dataset.act;
    if (act === 'bot') addBot();
    else if (act === 'start') startGame();
    else if (act === 'skip') { if (G.collecting) G.collecting.finish(); }
    else if (act === 'mute') { A.setMuted(!A.muted); if (!A.muted && G.phase === 'lobby' && s.music) A.music(true); updateTop(); }
    else if (act === 'quit') { if (G.phase === 'end' || confirm('End this game and go back to the lobby?')) quitToLobby(); }
    else if (act === 'again') playAgain();
  }

  function saveSettings() { U.store.set('settings', G.settings); }

  // ---------- players ----------
  function cleanName(n) { return U.clean(String(n || ''), true).replace(/[<>]/g, '').slice(0, 12).trim() || 'Player'; }
  function uniqueName(name) {
    let out = name, i = 2;
    while (G.players.some(p => p.name.toLowerCase() === out.toLowerCase())) out = name.slice(0, 10) + i++;
    return out;
  }
  function nextColor() { const used = G.players.map(p => p.color); return U.COLORS.find(c => !used.includes(c)) || U.pick(U.COLORS); }
  function assignVip() {
    G.players.forEach(p => { p.vip = false; });
    const v = G.players.find(p => !p.bot && p.connected);
    if (v) v.vip = true;
  }
  function newPlayer(o) { return Object.assign({ id: U.uid(), score: 0, delta: 0, stats: blankStats(), view: null, connected: true, bot: false }, o); }

  function addBot() {
    if (G.players.length >= MAX) return;
    const name = uniqueName(BOT_NAMES.find(n => !G.players.some(p => p.name === n)) || 'Bot');
    const used = G.players.map(p => p.avatar);
    G.players.push(newPlayer({ name, avatar: U.AVATARS.find(a => !used.includes(a)) || U.pick(U.AVATARS), color: nextColor(), bot: true }));
    A.play('join');
    if (G.phase === 'lobby') renderLobby(); else updateStrip();
  }

  function removePlayer(p, reason) {
    if (!p) return;
    if (!p.bot && p.conn && G.net) { G.net.send(p.conn, { t: 'reject', reason: reason || 'Removed.' }); setTimeout(() => { try { p.conn.close(); } catch (e) { /* closed */ } }, 300); }
    G.players = G.players.filter(x => x !== p);
    assignVip();
    if (G.collecting) G.collecting.check();
    if (G.phase === 'lobby') renderLobby(); else updateStrip();
  }

  function hello(conn, m) {
    const name = cleanName(m.name);
    const avatar = U.AVATARS.includes(m.avatar) ? m.avatar : U.pick(U.AVATARS);
    let p = G.players.find(x => !x.bot && m.pid && x.pid === m.pid);
    if (!p) p = G.players.find(x => !x.bot && !x.connected && x.name.toLowerCase() === name.toLowerCase());
    if (p) {
      if (p.conn && p.conn !== conn) { try { p.conn.close(); } catch (e) { /* old link */ } }
      p.conn = conn; p.connected = true; p.pid = m.pid || p.pid;
      G.net.send(conn, { t: 'welcome', you: { id: p.id, name: p.name, avatar: p.avatar, color: p.color }, code: G.code });
      assignVip();
      A.play('join');
      if (G.phase === 'lobby') renderLobby();
      else if (p.view) { sendView(p, p.view); updateStrip(); }
      else { sendView(p, { type: 'wait', msg: '👀 Eyes on the big screen' }); updateStrip(); }
      return;
    }
    if (G.players.length >= MAX) { G.net.send(conn, { t: 'reject', reason: 'This room is full (10 players).' }); return; }
    p = newPlayer({ pid: m.pid, name: uniqueName(name), avatar, color: nextColor(), conn });
    G.players.push(p);
    assignVip();
    A.play('join');
    G.net.send(conn, { t: 'welcome', you: { id: p.id, name: p.name, avatar: p.avatar, color: p.color }, code: G.code });
    if (G.phase === 'lobby') renderLobby();
    else { sendView(p, { type: 'wait', msg: 'You are in! 🎉', sub: 'You join from the next round.' }); updateStrip(); }
  }

  function onMessage(conn, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') return hello(conn, m);
    const p = G.players.find(x => x.conn === conn);
    if (!p) return;
    if (m.t === 'act') receive(p, m.id, m.a);
    else if (m.t === 'start' && p.vip && G.phase === 'lobby') startGame();
    else if (m.t === 'again' && p.vip && G.phase === 'end') playAgain();
  }

  function onClose(conn) {
    const p = G.players.find(x => x.conn === conn);
    if (!p) return;
    p.connected = false;
    p.conn = null;
    A.play('leave');
    assignVip();
    if (G.phase === 'lobby') {
      renderLobby();
      setTimeout(() => { if (!p.connected && G.phase === 'lobby' && G.players.includes(p)) removePlayer(p); }, 25000);
    } else {
      if (G.collecting) G.collecting.check();
      updateStrip();
    }
  }

  // ---------- game ----------
  function schedule(n) {
    const out = ['likely'];
    while (out.length < n) {
      const cycle = U.shuffle(['snake', 'hot', 'wrote', 'likely']);
      if (cycle[0] === out[out.length - 1]) cycle.push(cycle.shift());
      out.push(...cycle);
    }
    return out.slice(0, n);
  }

  function startGame() {
    if (G.phase !== 'lobby' && G.phase !== 'end') return;
    if (active().length < MIN) return;
    A.music(false);
    G.token++;
    G.players.forEach(p => { p.score = 0; p.delta = 0; p.stats = blankStats(); });
    runGame(G.token);
  }
  function playAgain() { G.phase = 'lobby'; startGame(); }

  function quitToLobby() {
    G.token++;
    if (G.collecting) G.collecting.finish();
    stopTimer();
    renderLobby();
    if (G.settings.music) A.music(true);
  }

  async function runGame() {
    G.phase = 'game';
    G.rounds = G.settings.length;
    const plan = schedule(G.rounds);
    try {
      for (G.round = 0; G.round < G.rounds; G.round++) {
        if (active().length < 2) break;
        let mode = plan[G.round];
        if (active().length < 3) mode = 'likely';
        const mult = G.round === G.rounds - 1 ? 2 : 1;
        await intro(mode, mult);
        if (mode === 'likely') await playLikely(mult);
        else if (mode === 'snake') await playSnake(mult);
        else if (mode === 'hot') await playHot(mult);
        else await playWrote(mult);
        if (G.round < G.rounds - 1) await scoreboard(false);
      }
      await finale();
    } catch (e) {
      if (e !== ABORT) { console.error(e); show('<div class="reveal bad">Something broke</div><div class="sub">' + esc(e.message) + '</div><button class="btn" data-act="quit">Back to lobby</button>'); }
    }
  }

  async function intro(mode, mult) {
    const M = MODES[mode];
    show('<div class="intro" style="--c:' + M.color + '"><div class="sub heavy">Round ' + (G.round + 1) + ' of ' + G.rounds + '</div><div class="icon">' + M.icon + '</div><div class="big">' + esc(M.name) + '</div><div class="rule">' + esc(M.rule) + '</div>' + (mult > 1 ? '<div class="double">FINAL ROUND: DOUBLE POINTS</div>' : '') + '</div>');
    A.play('slam');
    active().forEach(p => sendView(p, { type: 'wait', msg: M.icon + ' ' + M.name, sub: M.rule }));
    await wait(mult > 1 ? 4600 : 3800);
  }

  function tally(votes) { const c = {}; Object.values(votes).forEach(v => { c[v] = (c[v] || 0) + 1; }); return c; }
  function barsHtml(list, counts, votes) {
    return list.map(p => {
      const voters = Object.keys(votes).filter(v => votes[v] === p.id).map(byId).filter(Boolean);
      return '<div class="bar" data-id="' + p.id + '">' + U.avatar(p, 'sm') + '<div class="track"><div class="fill" style="--c:' + p.color + '"></div><div class="label">' + esc(p.name) + '</div><div class="voters">' + voters.map(v => U.avatar(v, 'sm')).join('') + '</div></div><div class="n">' + (counts[p.id] || 0) + '</div></div>';
    }).join('');
  }
  function growBars(counts) {
    const max = Math.max(1, ...Object.values(counts));
    U.$$('.bar').forEach(b => {
      const n = counts[b.dataset.id] || 0;
      b.querySelector('.fill').style.transform = 'scaleX(' + (n / max) + ')';
      if (n === max && n > 0) b.classList.add('top');
    });
  }

  // Round type 1: Most Likely To
  async function playLikely(mult) {
    const M = MODES.likely, list = active(), q = draw('likely');
    show(head(M) + '<div class="prompt">' + esc(q.t) + '</div><div class="sub">Vote on your phone. Voting for yourself is allowed.</div>' + timerHtml());
    A.play('whoosh');
    const votes = await W(collect({
      id: 'likely', players: list, seconds: 25,
      view: () => ({ type: 'choose', title: M.icon + ' ' + M.name, prompt: q.t, options: list.map(optOf) }),
      bot: () => U.pick(list).id,
      validate: vChoice(() => list),
    }));
    const counts = tally(votes);
    show(head(M) + '<div class="sub heavy">' + esc(q.t) + '</div><div class="bars">' + barsHtml(list, counts, votes) + '</div>');
    A.play('drum');
    await wait(1250);
    growBars(counts);
    A.play('reveal');
    await wait(2300);
    const max = Math.max(0, ...Object.values(counts));
    if (!max) { show(head(M) + '<div class="reveal bad">Nobody voted?!</div><div class="sub">Wake up, lads.</div>'); A.play('fail'); await wait(2500); return; }
    const top = list.filter(p => counts[p.id] === max);
    top.forEach(p => { p.stats.heat++; });
    const gains = [];
    Object.keys(votes).forEach(vid => { const v = byId(vid); if (v && top.some(t => t.id === votes[vid])) gains.push(award(v, 100 * mult)); });
    show(head(M) + '<div class="sub heavy">' + esc(q.t) + '</div>' + spot(top) + '<div class="reveal yel">' + (top.length > 1 ? 'Shared the blame' : 'The room has spoken') + '</div>' + gainsHtml(gains, 'Voted with the room'));
    A.play('slam');
    U.shake(stage());
    await wait(4200);
  }

  // Round type 2: Snake (one player does not know the word)
  function closeEnough(guess, word) {
    const g = U.norm(guess), w = U.norm(word);
    if (!g) return false;
    if (g === w || g === w + 's' || g + 's' === w || g === w + 'es') return true;
    if (w.length < 5) return false;
    const d = [];
    for (let i = 0; i <= g.length; i++) { d[i] = [i]; }
    for (let j = 0; j <= w.length; j++) d[0][j] = j;
    for (let i = 1; i <= g.length; i++) for (let j = 1; j <= w.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (g[i - 1] === w[j - 1] ? 0 : 1));
    return d[g.length][w.length] <= 1;
  }

  async function playSnake(mult) {
    const M = MODES.snake, list = active();
    const cat = draw('snake', i => i.cat);
    const word = U.pick(cat.words);
    const snake = U.pick(list);
    show(head(M) + '<div class="prompt">Category: ' + esc(cat.cat) + '</div><div class="sub">Everyone has the secret word on their phone, except the snake 🐍. Write a one word clue. Too obvious and the snake learns the word. Too vague and you look like the snake.</div>' + timerHtml());
    A.play('whoosh');
    const others = w => cat.words.filter(x => x !== w);
    const clues = await W(collect({
      id: 'snake-clue', players: list, seconds: 45, doneMsg: 'Clue locked in',
      view: p => p === snake
        ? { type: 'text', title: M.icon + ' Snake', secret: { snake: true, label: 'You are the snake 🐍', big: '???', sub: 'Category: ' + cat.cat + '. Blend in!' }, prompt: 'Write a one word clue', max: 20 }
        : { type: 'text', title: M.icon + ' Snake', secret: { label: 'The secret word', big: word, sub: 'Category: ' + cat.cat }, prompt: 'Write a one word clue', max: 20 },
      bot: p => U.pick(others(word)),
      validate: vText(20),
    }));
    // Reveal clues one by one.
    const order = U.shuffle(list.filter(p => clues[p.id] !== undefined));
    const bad = {};
    order.forEach(p => { if (p !== snake && U.norm(word).length >= 3 && U.norm(clues[p.id]).includes(U.norm(word))) bad[p.id] = true; });
    const cardsOf = n => '<div class="cards">' + order.slice(0, n).map(p => '<div class="card ' + (bad[p.id] ? 'bad' : '') + '">' + U.avatar(p, 'sm') + '<div><div class="mute heavy" style="font-size:12px">' + esc(p.name) + '</div><div class="word">' + (bad[p.id] ? 'Said the word 🤦' : esc(clues[p.id])) + '</div></div></div>').join('') + '</div>';
    for (let i = 1; i <= order.length; i++) {
      show(head(M) + '<div class="sub heavy">Category: ' + esc(cat.cat) + '</div>' + cardsOf(i));
      A.play(bad[order[i - 1].id] ? 'buzz' : 'pop');
      await wait(1000);
    }
    const penalties = order.filter(p => bad[p.id]).map(p => award(p, -100));
    await wait(800);
    // Vote.
    show(head(M) + '<div class="sub heavy">Category: ' + esc(cat.cat) + '</div>' + cardsOf(order.length) + '<div class="prompt" style="font-size:clamp(24px,3.4vw,44px)">Who is the snake? Argue, then vote.</div>' + timerHtml());
    const votes = await W(collect({
      id: 'snake-vote', players: list, seconds: 50,
      view: p => ({ type: 'choose', title: M.icon + ' Find the snake', prompt: 'Who is the snake?', options: list.filter(o => o !== p).map(optOf) }),
      bot: p => (Math.random() < 0.35 && p !== snake ? snake.id : U.pick(list.filter(o => o !== p)).id),
      validate: vChoice(p => list.filter(o => o !== p)),
    }));
    const counts = tally(votes);
    show(head(M) + '<div class="bars">' + barsHtml(list, counts, votes) + '</div>');
    A.play('drum');
    await wait(1250);
    growBars(counts);
    await wait(1800);
    const max = Math.max(0, ...Object.values(counts));
    const leaders = list.filter(p => (counts[p.id] || 0) === max);
    const caught = max > 0 && leaders.length === 1 && leaders[0] === snake;
    show(head(M) + '<div class="sub heavy">The snake was...</div>');
    A.play('drum');
    await wait(1500);
    const gains = penalties.slice();
    if (!caught) {
      snake.stats.snake++;
      gains.push(award(snake, 300 * mult));
      show(head(M) + spot([snake]) + '<div class="reveal bad">The snake got away 🐍</div><div class="sub">The word was <b class="heavy" style="color:#fff">' + esc(word) + '</b></div>' + gainsHtml(gains));
      A.play('fail');
      await wait(4800);
      return;
    }
    Object.keys(votes).forEach(vid => { if (votes[vid] === snake.id) { const v = byId(vid); if (v) gains.push(award(v, 100 * mult)); } });
    show(head(M) + spot([snake]) + '<div class="reveal good">Caught! 🎯</div><div class="prompt" style="font-size:clamp(22px,3vw,40px)">Last chance: ' + esc(snake.name) + ' can steal the round by guessing the word.</div>' + timerHtml());
    A.play('slam');
    const guess = await W(collect({
      id: 'snake-guess', players: [snake], seconds: 25,
      view: () => ({ type: 'text', title: '🐍 Last chance', prompt: 'Guess the secret word to steal the round', sub: 'Category: ' + cat.cat, max: 24 }),
      bot: () => (Math.random() < 0.35 ? word : U.pick(others(word))),
      validate: vText(24),
    }));
    const g = guess[snake.id] || '';
    const stole = closeEnough(g, word);
    if (stole) { snake.stats.snake++; gains.push(award(snake, 300 * mult)); }
    show(head(M) + spot([snake]) + '<div class="sub">Guessed: <b class="heavy" style="color:#fff">' + esc(g || 'nothing') + '</b></div>' +
      (stole ? '<div class="reveal good">Stolen! 🐍💰</div>' : '<div class="reveal yel">Wrong! The word was ' + esc(word) + '</div>') + gainsHtml(gains));
    A.play(stole ? 'fanfare' : 'buzz');
    if (stole) U.confetti(50);
    await wait(4800);
  }

  // Round type 3: Hot Take
  async function playHot(mult) {
    const M = MODES.hot, list = active(), q = draw('hot');
    show(head(M) + '<div class="prompt">“' + esc(q.t) + '”</div><div class="sub">How much do you agree? 0 is never, 10 is facts. Be honest, nobody sees it yet.</div>' + timerHtml());
    A.play('whoosh');
    const rates = await W(collect({
      id: 'hot-rate', players: list, seconds: 25,
      view: () => ({ type: 'slider', title: M.icon + ' ' + M.name, prompt: q.t, labels: ['Never', 'Facts'], value: 5 }),
      bot: () => U.rand(11),
      validate: vSlider,
    }));
    const rated = list.filter(p => rates[p.id] !== undefined);
    if (rated.length < 2) { show(head(M) + '<div class="reveal bad">Not enough takes!</div>'); await wait(2200); return; }
    const fewest = Math.min(...rated.map(p => p.stats.seat));
    const seat = U.pick(rated.filter(p => p.stats.seat === fewest));
    seat.stats.seat++;
    const guessers = list.filter(p => p !== seat);
    show(head(M) + '<div class="sub heavy">“' + esc(q.t) + '”</div>' + spot([seat]) + '<div class="prompt" style="font-size:clamp(26px,3.8vw,52px)">What did ' + esc(seat.name) + ' put?</div>' + timerHtml());
    A.play('slam');
    const guesses = await W(collect({
      id: 'hot-guess', players: guessers, seconds: 25,
      view: () => ({ type: 'slider', title: M.icon + ' Read your mate', prompt: 'What did ' + seat.name + ' put?', sub: q.t, labels: ['Never', 'Facts'], value: 5 }),
      bot: () => Math.max(0, Math.min(10, rates[seat.id] + U.rand(7) - 3)),
      validate: vSlider,
    }));
    const truth = rates[seat.id];
    const stack = {};
    const pins = guessers.filter(p => guesses[p.id] !== undefined).map(p => {
      const v = guesses[p.id], k = stack[v] = (stack[v] || 0) + 1;
      return '<div class="pin" style="left:' + (v * 10) + '%;bottom:' + (52 + (k - 1) * 40) + 'px">' + U.avatar(p, 'sm') + '</div>';
    }).join('');
    const ticks = Array.from({ length: 11 }, (_, i) => '<div class="tick" style="left:' + (i * 10) + '%">' + i + '</div>').join('');
    const lineH = 150 + Math.max(0, Math.max(0, ...Object.values(stack)) - 2) * 40;
    const base = head(M) + '<div class="sub heavy">What did ' + esc(seat.name) + ' put for “' + esc(q.t) + '”</div><div class="line" style="height:' + lineH + 'px"><div class="axis"></div>' + ticks + pins;
    show(base + '</div>');
    A.play('drum');
    await wait(1700);
    show(base + '<div class="truth" style="left:' + (truth * 10) + '%"><b>' + truth + '</b></div></div>');
    A.play('slam');
    U.shake(stage());
    const gains = [];
    let close = 0;
    guessers.forEach(p => {
      const g = guesses[p.id];
      if (g === undefined) return;
      const off = Math.abs(g - truth);
      const pts = off === 0 ? 300 : off === 1 ? 200 : off === 2 ? 100 : 0;
      if (off <= 1) close++;
      if (pts) { p.stats.mind += pts * mult; gains.push(award(p, pts * mult)); }
    });
    if (close) gains.push(award(seat, 50 * close * mult));
    const avg = rated.reduce((s, p) => s + rates[p.id], 0) / rated.length;
    await wait(1400);
    show(base + '<div class="truth" style="left:' + (truth * 10) + '%"><b>' + truth + '</b></div></div>' +
      '<div class="sub">Room average: <b class="heavy" style="color:#fff">' + avg.toFixed(1) + '</b>. Exact guess 300, one off 200, two off 100.</div>' + gainsHtml(gains));
    A.play(gains.length ? 'ding' : 'fail');
    await wait(4600);
  }

  // Round type 4: Who Wrote That?
  async function playWrote(mult) {
    const M = MODES.wrote, list = active(), q = draw('wrote');
    show(head(M) + '<div class="prompt">' + esc(q.t) + '</div><div class="sub">Write something funny on your phone. Nobody sees who wrote what.</div>' + timerHtml());
    A.play('whoosh');
    const answers = await W(collect({
      id: 'wrote-write', players: list, seconds: 60, doneMsg: 'Sent. Act natural 😇',
      view: () => ({ type: 'text', title: M.icon + ' ' + M.name, prompt: q.t, sub: 'Your mates will guess who wrote it.', max: 60, long: true }),
      bot: () => U.pick(BOT_LINES),
      validate: vText(60),
    }));
    const entries = U.shuffle(list.filter(p => answers[p.id])).slice(0, list.length <= 6 ? 6 : 5);
    if (entries.length < 2) { show(head(M) + '<div class="reveal bad">Not enough answers!</div>'); await wait(2200); return; }
    for (let i = 0; i < entries.length; i++) {
      const author = entries[i], text = answers[author.id];
      const guessers = list.filter(p => p !== author);
      show(head(M) + '<div class="sub heavy">' + esc(q.t) + ' (' + (i + 1) + ' of ' + entries.length + ')</div><div class="quote">' + esc(text) + '</div><div class="sub">Who wrote it?</div>' + timerHtml());
      A.play('pop');
      const votes = await W(collect({
        id: 'wrote-guess', players: guessers, seconds: 20,
        view: p => ({ type: 'choose', title: M.icon + ' Who wrote it?', quote: text, prompt: 'Who wrote this?', options: list.filter(o => o !== p).map(optOf) }),
        bot: p => (Math.random() < 0.4 ? author.id : U.pick(list.filter(o => o !== p)).id),
        validate: vChoice(p => list.filter(o => o !== p)),
      }));
      A.play('drum');
      await wait(1100);
      const gains = [];
      let fooled = 0;
      guessers.forEach(p => {
        const v = votes[p.id];
        if (v === undefined) return;
        if (v === author.id) gains.push(award(p, 100 * mult));
        else fooled++;
      });
      if (fooled) { author.stats.fools += fooled; gains.push(award(author, 100 * fooled * mult)); }
      show(head(M) + '<div class="quote" style="font-size:clamp(22px,3vw,40px)">' + esc(text) + '</div>' + spot([author], 'wrote it') +
        '<div class="sub">' + (guessers.length - fooled) + ' got it, ' + fooled + ' got fooled</div>' + gainsHtml(gains));
      A.play('reveal');
      await wait(3600);
    }
  }

  // ---------- scores and the end ----------
  async function scoreboard(final) {
    const list = G.players.slice().sort((a, b) => b.score - a.score);
    const lastIdx = list.length >= 3 ? list.length - 1 : -1;
    show('<div class="reveal yel" style="font-size:clamp(30px,4.6vw,60px)">' + (final ? 'Final scores' : 'Scores') + '</div><div class="board">' +
      list.map((p, i) => '<div class="row ' + (i === 0 && p.score > 0 ? 'first' : '') + (i === lastIdx ? ' last' : '') + '"><div class="rk">' + (i + 1) + '</div>' + U.avatar(p, 'sm') +
        '<div class="nm">' + esc(p.name) + '</div><div class="dl">' + (p.delta ? (p.delta > 0 ? '+' : '') + p.delta : '') + '</div><div class="sc" data-from="' + (p.score - p.delta) + '" data-to="' + p.score + '">' + (p.score - p.delta) + '</div></div>').join('') + '</div>' +
      (!final && lastIdx >= 0 ? '<div class="sub">💀 Last place at the end does the forfeit.</div>' : ''));
    A.play('pop');
    list.forEach((p, i) => sendView(p, { type: 'wait', msg: '#' + (i + 1) + ' of ' + list.length, sub: p.delta > 0 ? '+' + p.delta + ' this round' : p.delta < 0 ? p.delta + ' this round' : 'No points this round', big: true }));
    const t0 = Date.now(), dur = 900;
    await new Promise(res => {
      const step = () => {
        const k = Math.min(1, (Date.now() - t0) / dur);
        U.$$('.sc[data-to]').forEach(el => { const a = Number(el.dataset.from), b = Number(el.dataset.to); el.textContent = Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3))); });
        if (k < 1) requestAnimationFrame(step); else res();
      };
      step();
    });
    G.players.forEach(p => { p.delta = 0; });
    await wait(final ? 2800 : 4800);
  }

  function wheelHtml(pool) {
    const cols = ['#ffd400', '#ff3b4a', '#2d7dff', '#22d37a', '#ff4fd8', '#ff8a00', '#00d9ff', '#c6ff00'];
    const grad = pool.map((_, i) => cols[i % 8] + ' ' + (i * 45) + 'deg ' + ((i + 1) * 45) + 'deg').join(',');
    const labels = pool.map((_, i) => {
      const a = (i + 0.5) * 45 * Math.PI / 180;
      return '<span style="left:' + (50 + 36 * Math.sin(a)) + '%;top:' + (50 - 36 * Math.cos(a)) + '%;transform:translate(-50%,-50%)">' + (i + 1) + '</span>';
    }).join('');
    return '<div class="wheel"><div class="pointer"></div><div class="disc" id="disc" style="background:conic-gradient(' + grad + ')">' + labels + '</div><div class="hub">💀</div></div>';
  }

  async function finale() {
    G.phase = 'final';
    await scoreboard(true);
    const list = G.players.slice().sort((a, b) => b.score - a.score);
    const topScore = list[0].score;
    const winners = list.filter(p => p.score === topScore);
    show('<div class="sub heavy">The winner is...</div>');
    A.play('drum');
    await wait(1500);
    show(spot(winners) + '<div class="reveal yel">' + (winners.length > 1 ? 'Joint winners 👑' : 'Winner 👑') + '</div><div class="sub">' + topScore + ' points</div>');
    A.play('fanfare');
    U.confetti(120);
    winners.forEach(p => sendView(p, { type: 'wait', msg: 'You won 👑', sub: 'Take a bow.', big: true }));
    await wait(4200);

    const low = Math.min(...list.map(p => p.score));
    const loser = U.pick(list.filter(p => p.score === low && !winners.includes(p)).length ? list.filter(p => p.score === low && !winners.includes(p)) : [list[list.length - 1]]);
    let forfeit = null;
    if (G.settings.forfeits && list.length >= 2) {
      // Eight different forfeits for the wheel, avoiding ones used in earlier games this session.
      const wheel = [];
      for (let tries = 0; wheel.length < 8 && tries < 40; tries++) { const f = draw('forfeits'); if (!wheel.includes(f)) wheel.push(f); }
      for (let i = 0; wheel.length < 8; i++) wheel.push(wheel[i]);
      const flist = wheel.map((f, i) => '<div data-f="' + i + '"><b>' + (i + 1) + '</b><span>' + esc(f.t) + '</span></div>').join('');
      show('<div class="reveal bad" style="font-size:clamp(30px,4.4vw,60px)">💀 Forfeit zone 💀</div>' +
        '<div class="wheelwrap">' + wheelHtml(wheel) + '<div class="flist"><div class="spotline">' + U.avatar(loser, 'sm') + '<span class="heavy">' + esc(loser.name) + ' came last. Spin it on your phone.</span></div>' + flist + '</div></div>');
      A.play('fail');
      await W(collect({
        id: 'spin', players: [loser], seconds: 20,
        view: () => ({ type: 'spin', title: 'You came last 💀', prompt: 'Spin the forfeit wheel' }),
        bot: () => true, validate: () => true,
      }));
      const hit = U.rand(8);
      const disc = U.$('#disc');
      if (disc) disc.style.transform = 'rotate(' + (360 * 6 - (hit + 0.5) * 45 + (Math.random() * 24 - 12)) + 'deg)';
      A.spinTicks(5);
      await wait(5600);
      const row = U.$('[data-f="' + hit + '"]');
      if (row) row.classList.add('hit');
      A.play('slam');
      await wait(900);
      forfeit = wheel[hit].t;
      show('<div class="reveal bad">Forfeit</div>' + spot([loser]) + '<div class="forfeit">' + esc(forfeit) + '</div><div class="sub">Do it now. The room decides if it counts.</div>');
      A.play('buzz');
      sendView(loser, { type: 'wait', msg: 'Your forfeit 💀', sub: forfeit, big: true });
      await wait(7500);
    }

    // Awards
    const awards = [{ t: '👑 Winner', p: winners[0], why: topScore + ' points' }];
    const best = (key, title, why) => {
      const m = Math.max(0, ...G.players.map(p => p.stats[key]));
      if (m > 0) { const p = G.players.find(x => x.stats[key] === m); awards.push({ t: title, p, why: why(m) }); }
    };
    best('snake', '🐍 Master Snake', n => n + ' snake win' + (n > 1 ? 's' : ''));
    best('heat', '🔥 Most Roasted', n => 'Top of the votes ' + n + ' time' + (n > 1 ? 's' : ''));
    best('mind', '🧠 Mind Reader', n => n + ' points reading minds');
    best('fools', '🎭 Undercover Writer', n => 'Fooled the room ' + n + ' time' + (n > 1 ? 's' : ''));
    if (forfeit) awards.push({ t: '💀 Owes a forfeit', p: loser, why: 'Came last' });
    G.phase = 'end';
    show('<div class="reveal yel" style="font-size:clamp(30px,4.6vw,60px)">Awards</div><div class="awards">' +
      awards.map((a, i) => '<div class="award" style="animation-delay:' + (i * 0.15) + 's"><div class="t">' + a.t + '</div>' + U.avatar(a.p) + '<div class="who">' + esc(a.p.name) + '</div><div class="why">' + esc(a.why) + '</div></div>').join('') +
      '</div><div class="hostctl"><button class="btn" data-act="again">Play again</button><button class="btn ghost" data-act="quit">Back to lobby</button></div>');
    A.play('reveal');
    const ranked = G.players.slice().sort((a, b) => b.score - a.score);
    ranked.forEach((p, i) => sendView(p, { type: 'end', rank: i + 1, total: ranked.length, score: p.score, msg: winners.includes(p) ? 'You won 👑' : (forfeit && p === loser) ? 'You owe a forfeit 💀' : 'GG', vip: !!p.vip }));
  }

  // ---------- start ----------
  H.start = function () {
    G.settings = Object.assign({}, DEFAULTS, U.store.get('settings', {}));
    renderShell();
    renderLobby();
    G.net = FF.net.host({
      ready: code => { G.code = code; G.online = true; G.netError = null; if (G.phase === 'lobby') renderLobby(); else updateTop(); },
      message: onMessage,
      close: onClose,
      error: text => { G.netError = text; if (G.phase === 'lobby') renderLobby(); },
    });
    window.addEventListener('beforeunload', e => { if (G.phase === 'game' || G.phase === 'final') { e.preventDefault(); e.returnValue = ''; } });
    if (G.settings.music) {
      const kick = () => { A.unlock(); if (G.phase === 'lobby' && G.settings.music) A.music(true); window.removeEventListener('pointerdown', kick); };
      window.addEventListener('pointerdown', kick);
    }
    const bots = Number(params.get('bots') || 0);
    for (let i = 0; i < Math.min(bots, MAX); i++) addBot();
    if (params.has('autostart')) setTimeout(() => { if (params.has('len')) G.settings.length = Number(params.get('len')); startGame(); }, 400);
  };

  // For automated tests.
  FF.debug = {
    state: () => ({
      phase: G.phase, round: G.round, rounds: G.rounds, code: G.code, online: G.online, netError: G.netError,
      collecting: G.collecting ? G.collecting.id : null,
      players: G.players.map(p => ({ name: p.name, bot: p.bot, connected: p.connected, score: p.score, vip: !!p.vip })),
    }),
  };
})();
