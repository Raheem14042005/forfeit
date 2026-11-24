// FORFEIT shared helpers.
window.FF = window.FF || {};
(function () {
  const U = FF.u = {};

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  U.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.rand = n => Math.floor(Math.random() * n);
  U.pick = a => a[U.rand(a.length)];
  U.shuffle = a => {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = U.rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  U.sleep = ms => new Promise(r => setTimeout(r, ms));
  U.uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  U.isTouch = () => matchMedia('(pointer: coarse)').matches;

  // Room codes use consonants only, so a code can never spell a rude word.
  U.code = () => {
    const A = 'BCDFGHJKLMNPQRSTVWXZ';
    let s = '';
    for (let i = 0; i < 4; i++) s += A[U.rand(A.length)];
    return s;
  };

  U.store = {
    get(k, d) { try { const v = localStorage.getItem('ff_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ff_' + k, JSON.stringify(v)); } catch (e) { /* storage blocked: play on */ } },
  };

  U.AVATARS = ['😎', '🤡', '👽', '🐸', '🦊', '🐼', '🐯', '🦁', '🐷', '🐵', '🦄', '🐙', '🍕', '🌶️', '👑', '💀', '🔥', '⚽', '🎮', '🤠'];
  U.COLORS = ['#ffd400', '#ff3b4a', '#2d7dff', '#22d37a', '#ff4fd8', '#ff8a00', '#00d9ff', '#b26bff', '#c6ff00', '#ff6f91'];

  U.avatar = (p, size) => '<div class="av ' + (size || '') + '" style="--c:' + p.color + '">' + U.esc(p.avatar) + '</div>';

  // Typed text is shown on a big screen and often on a stream.
  // Hate terms are always hidden; everyday swears are hidden when "Bleep swears" is on.
  const HATE = [/n+[i1!|]+g+(?:a|e+r|ah|uh|az)s?/gi, /f+[a@4]+g+(?:g?[o0]t)?s?\b/gi, /r+[e3]+t+[a@4]+r+d+(?:s|ed)?/gi, /\bp+[a@4]+k+[i1]+s?\b/gi, /\bc+h+[i1]+n+k+s?\b/gi, /\bs+p+[a@4]+s+t+i*c*s?\b/gi, /\bt+r+[a@4]+n+n+(?:y|ie)s?\b/gi, /\bk+[i1]+k+e+s?\b/gi];
  const SWEAR = /\b(?:f+[u*]+c+k\w*|s+h+[i1]+t+\w*|c+u+n+t+\w*|b+[i1]+t+c+h+\w*|w+[a@]+n+k+\w*|t+w+[a@]+t+s?|d+[i1]+c+k+(?:s|head)?|p+r+[i1]+c+k+s?|b+[a@]+s+t+[a@]+r+d+s?|b+o+l+l+o+c+k+s?|s+l+[a@]+g+s?|w+h+o+r+e+s?)\b/gi;
  const mask = w => w[0] + '*'.repeat(Math.max(1, w.length - 1));
  U.clean = (s, bleep) => {
    s = String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    HATE.forEach(re => { s = s.replace(re, mask); });
    if (bleep) s = s.replace(SWEAR, mask);
    return s;
  };
  U.norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Celebration bits on the fx layer.
  U.confetti = (n) => {
    const fx = U.$('#fx');
    if (!fx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < (n || 90); i++) {
      const d = document.createElement('div');
      d.className = 'confetti';
      d.style.left = Math.random() * 100 + 'vw';
      d.style.background = U.pick(U.COLORS);
      d.style.animationDuration = 2.2 + Math.random() * 2 + 's';
      d.style.animationDelay = Math.random() * .6 + 's';
      fx.appendChild(d);
      setTimeout(() => d.remove(), 5200);
    }
  };
  U.shake = el => {
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  };
  U.buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no vibration */ } };
})();
