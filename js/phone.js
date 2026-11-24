// FORFEIT phone controller. It renders whatever view the host sends and sends answers back.
window.FF = window.FF || {};
(function () {
  const U = FF.u, A = FF.audio, esc = U.esc;
  const P = FF.phone = {};
  let link = null, code = null, me = null, view = null, retry = 0, pingIv = null, wantOpen = false;
  const pid = (() => { let id = U.store.get('pid', null); if (!id) { id = U.uid(); U.store.set('pid', id); } return id; })();
  const app = () => U.$('#app');

  function overlay(text) {
    let o = U.$('#overlay');
    if (!text) { if (o) o.remove(); return; }
    if (!o) { o = document.createElement('div'); o.id = 'overlay'; o.className = 'overlay'; document.body.appendChild(o); }
    o.textContent = text;
  }

  P.showJoin = function (o) {
    o = o || {};
    wantOpen = false;
    if (link) { link.close(); link = null; }
    overlay(null);
    const last = U.store.get('last', {});
    let avatar = o.avatar || last.avatar || U.pick(U.AVATARS);
    app().innerHTML =
      '<div class="phone"><div class="center" style="margin-top:6px"><div class="logo" style="font-size:60px">FORFEIT<span class="bang">!</span></div></div>' +
      '<div class="pbody" style="justify-content:flex-start">' +
      (o.error ? '<div class="err">' + esc(o.error) + '</div>' : '') +
      '<div><div class="label">Room code</div><input class="field heavy" id="code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="' + esc(o.code || '') + '" style="text-transform:uppercase;letter-spacing:10px;font-size:32px;text-align:center"></div>' +
      '<div><div class="label">Your name</div><input class="field" id="name" maxlength="12" autocomplete="off" placeholder="Name" value="' + esc(o.name || last.name || '') + '"></div>' +
      '<div><div class="label">Pick your face</div><div class="avpick" id="avs">' + U.AVATARS.map(a => '<button data-av="' + a + '" class="' + (a === avatar ? 'on' : '') + '">' + a + '</button>').join('') + '</div></div>' +
      '<button class="btn big" id="go">Join</button>' +
      '<div class="foot center">Hosting? Open this page on the big screen and tap Host a game.</div>' +
      '</div></div>';
    U.$('#avs').addEventListener('click', e => {
      const b = e.target.closest('[data-av]');
      if (!b) return;
      avatar = b.dataset.av;
      U.$$('#avs button').forEach(x => x.classList.toggle('on', x === b));
    });
    const go = () => {
      A.unlock();
      const c = U.$('#code').value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      const n = U.$('#name').value.replace(/\s+/g, ' ').trim().slice(0, 12);
      if (c.length !== 4) return P.showJoin({ error: 'Type the 4 letter code from the big screen.', code: c, name: n, avatar });
      if (!n) { U.$('#name').focus(); U.shake(U.$('#name')); return; }
      code = c;
      me = { name: n, avatar };
      U.store.set('last', { code: c, name: n, avatar, at: Date.now() });
      retry = 0;
      connect();
    };
    U.$('#go').addEventListener('click', go);
    U.$('#name').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    U.$('#code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    // A phone that refreshes mid game drops straight back into its seat.
    if (o.auto && !o.error && last.name && last.code === o.code && Date.now() - (last.at || 0) < 3 * 3600 * 1000) { go(); return; }
    if (!o.code) U.$('#code').focus();
  };

  // Keep the phone screen awake while in a room (works on https pages).
  let wake = null;
  function keepAwake() {
    try { if (navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(w => { wake = w; w.addEventListener('release', () => { wake = null; }); }).catch(() => {}); } catch (e) { /* not supported */ }
  }

  function connect() {
    if (link) link.close();
    wantOpen = true;
    overlay(retry ? 'Reconnecting...' : 'Joining ' + code + '...');
    const mine = link = FF.net.join(code, {
      open: () => { if (link !== mine) return; retry = 0; keepAwake(); link.send({ t: 'hello', name: me.name, avatar: me.avatar, pid }); },
      message: m => { if (link === mine) onMsg(m); },
      lost: () => {
        if (link !== mine || !wantOpen) return;
        if (retry++ < 30) { overlay('Reconnecting...'); setTimeout(() => { if (link === mine && wantOpen) connect(); }, Math.min(4000, 700 + retry * 300)); }
        else P.showJoin({ code, error: 'Lost the connection. Check your signal and join again.' });
      },
      fail: msg => { if (link !== mine) return; P.showJoin({ code, name: me.name, avatar: me.avatar, error: msg }); },
    });
    if (!pingIv) pingIv = setInterval(() => { if (link && wantOpen) link.send({ t: 'ping' }); }, 5000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !wantOpen) return;
    keepAwake();
    if (link && !link.isOpen()) { retry = 1; connect(); }
  });

  function onMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'welcome') { overlay(null); me.name = m.you.name; return; }
    if (m.t === 'reject') { P.showJoin({ code, error: m.reason }); return; }
    if (m.t === 'view') { overlay(null); render(m.v); }
  }

  function act(a) {
    if (!view || !view.id) return;
    link.send({ t: 'act', id: view.id, a });
    A.play('lock');
    render({ type: 'done', msg: 'Locked in!', you: view.you });
  }

  function render(v) {
    // The same input view can arrive twice (reconnect). Keep what the player already typed.
    if (view && v.id && v.id === view.id && v.type === view.type && U.$('.pbody')) { view = v; return; }
    view = v;
    if (['text', 'choose', 'slider', 'spin'].includes(v.type)) U.buzz(40);
    const you = v.you || {};
    const head = '<div class="phead"><div class="av sm" style="--c:' + (you.color || '#ffd400') + '">' + esc(you.avatar || (me && me.avatar) || '🙂') + '</div>' +
      '<div class="who">' + esc(you.name || (me && me.name) || '') + (you.vip ? ' 👑' : '') + '</div><div class="score">' + (you.score || 0) + ' pts</div></div>';
    const title = v.title ? '<div class="ptitle">' + esc(v.title) + '</div>' : '';
    let body = '';
    if (v.type === 'lobby') {
      body = '<div class="center"><div class="av lg" style="margin:0 auto;--c:' + (you.color || '#ffd400') + '">' + esc(you.avatar || '') + '</div>' +
        '<div class="pprompt" style="margin-top:16px">You are in!</div><div class="psub" style="margin-top:8px">' + v.count + ' in the room. ' +
        (v.vip ? 'You are the VIP 👑. Start when everyone is in.' : 'Waiting for the VIP to start.') + '</div></div>' +
        (v.vip ? '<button class="btn big" id="start" ' + (v.count >= v.min ? '' : 'disabled') + '>' + (v.count >= v.min ? 'Everyone is in. Start!' : 'Need ' + (v.min - v.count) + ' more') + '</button>' : '');
    } else if (v.type === 'wait') {
      body = '<div class="center">' + (v.big ? '<div class="sval" style="font-size:58px">' + esc(v.msg) + '</div>' : '<div class="pprompt">' + esc(v.msg) + '</div>') +
        (v.sub ? '<div class="psub" style="margin-top:12px;font-size:' + (v.big ? '20px' : '15px') + '">' + esc(v.sub) + '</div>' : '') + '</div>';
    } else if (v.type === 'done') {
      body = '<div class="bigok">✅</div><div class="pprompt center">' + esc(v.msg) + '</div><div class="psub center">Waiting for the others...</div>';
    } else if (v.type === 'text') {
      const s = v.secret;
      body = title + (s ? '<div class="secret ' + (s.snake ? 'snake' : '') + '"><div class="lbl">' + esc(s.label) + '</div><div class="big">' + esc(s.big) + '</div><div class="s">' + esc(s.sub || '') + '</div></div>' : '') +
        '<div class="pprompt">' + esc(v.prompt) + '</div>' + (v.sub ? '<div class="psub">' + esc(v.sub) + '</div>' : '') +
        (v.long ? '<textarea class="field" id="txt" rows="3" maxlength="' + v.max + '" placeholder="Type here"></textarea>' : '<input class="field" id="txt" maxlength="' + v.max + '" autocomplete="off" placeholder="Type here">') +
        '<div class="count" id="cnt">0 / ' + v.max + '</div><button class="btn big" id="send">Send</button>';
    } else if (v.type === 'choose') {
      body = title + (v.quote ? '<div class="qcard">“' + esc(v.quote) + '”</div>' : '') + '<div class="pprompt">' + esc(v.prompt) + '</div>' +
        '<div class="opts">' + v.options.map(o => '<button class="opt" data-id="' + esc(o.id) + '"><div class="av" style="--c:' + o.color + '">' + esc(o.avatar) + '</div><div class="name">' + esc(o.label) + '</div></button>').join('') + '</div>';
    } else if (v.type === 'slider') {
      const val = v.value == null ? 5 : v.value;
      body = title + '<div class="pprompt">' + esc(v.prompt) + '</div>' + (v.sub ? '<div class="psub">“' + esc(v.sub) + '”</div>' : '') +
        '<div class="sval" id="sval">' + val + '</div><input type="range" class="slider" id="rng" min="0" max="10" step="1" value="' + val + '">' +
        '<div class="slabels"><span>0 ' + esc((v.labels || [])[0] || '') + '</span><span>' + esc((v.labels || [])[1] || '') + ' 10</span></div><button class="btn big" id="lock">Lock it in</button>';
    } else if (v.type === 'spin') {
      body = '<div class="center">' + title + '<div class="pprompt" style="margin:10px 0 24px">' + esc(v.prompt) + '</div><button class="btn spinbtn" id="spin">SPIN</button></div>';
    } else if (v.type === 'end') {
      body = '<div class="center"><div class="sval" style="font-size:72px">#' + v.rank + '</div><div class="psub">of ' + v.total + ' with ' + v.score + ' points</div>' +
        '<div class="pprompt" style="margin-top:18px">' + esc(v.msg) + '</div></div>' + (v.vip ? '<button class="btn big" id="again">Play again</button>' : '<div class="psub center">The VIP can start another game.</div>');
    }
    app().innerHTML = '<div class="phone">' + head + '<div class="pbody">' + body + '</div></div>';
    wire(v);
  }

  function wire(v) {
    const on = (id, fn) => { const el = U.$('#' + id); if (el) el.addEventListener('click', () => { A.unlock(); fn(el); }); };
    on('start', () => link.send({ t: 'start' }));
    on('again', () => link.send({ t: 'again' }));
    on('spin', () => act(true));
    if (v.type === 'text') {
      const txt = U.$('#txt'), cnt = U.$('#cnt');
      txt.addEventListener('input', () => { cnt.textContent = txt.value.length + ' / ' + v.max; });
      const send = () => { const s = txt.value.replace(/\s+/g, ' ').trim(); if (!s) { U.shake(txt); txt.focus(); return; } act(s); };
      on('send', send);
      txt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    }
    if (v.type === 'choose') {
      U.$$('.opt').forEach(b => b.addEventListener('click', () => { b.classList.add('sel'); act(b.dataset.id); }));
    }
    if (v.type === 'slider') {
      const r = U.$('#rng'), out = U.$('#sval');
      r.addEventListener('input', () => { out.textContent = r.value; U.buzz(8); });
      on('lock', () => act(Number(r.value)));
    }
  }
})();
