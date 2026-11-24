// FORFEIT networking. Peer to peer WebRTC through PeerJS: the big screen is the host,
// phones connect straight to it. The free PeerJS broker only introduces the devices,
// so there is no game server to pay for.
window.FF = window.FF || {};
(function () {
  const N = FF.net = {};
  const PREFIX = 'forfeit-party-v1-';
  const OPTS = { debug: 0 };

  N.available = () => typeof window.Peer === 'function';

  // handlers: ready(code), connect(conn), message(conn, data), close(conn), error(text)
  N.host = function (h) {
    let peer = null, tries = 0, opened = false;
    function open() {
      const code = FF.u.code();
      peer = new Peer(PREFIX + code, OPTS);
      const watchdog = setTimeout(() => { if (!opened) h.error('Cannot reach the join server. Phones cannot join yet, but you can try it with bots.'); }, 12000);
      peer.on('open', () => { opened = true; clearTimeout(watchdog); tries = 0; h.ready(code); });
      peer.on('connection', conn => {
        conn.on('open', () => h.connect && h.connect(conn));
        conn.on('data', d => h.message(conn, d));
        conn.on('close', () => h.close(conn));
        conn.on('error', () => h.close(conn));
      });
      peer.on('disconnected', () => {
        // Lost the broker only; live phone links keep working. Reconnect so new phones can join.
        setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* retry later */ } }, 1500);
      });
      peer.on('error', err => {
        if (err.type === 'unavailable-id' && tries++ < 6) { clearTimeout(watchdog); peer.destroy(); open(); return; }
        if (err.type === 'peer-unavailable') return;
        if (!opened) { clearTimeout(watchdog); h.error('Cannot reach the join server (' + err.type + '). You can still try it with bots.'); }
      });
    }
    if (!N.available()) { setTimeout(() => h.error('Network library missing. You can still try it with bots.'), 0); }
    else open();
    return {
      send(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) { /* phone gone */ } },
      close() { try { if (peer) peer.destroy(); } catch (e) { /* already closed */ } },
    };
  };

  // handlers: open(), message(data), lost(), fail(text)
  N.join = function (code, h) {
    let peer = null, conn = null, closed = false, opened = false;
    const watchdog = setTimeout(() => { if (!opened && !closed) h.lost('timeout'); }, 12000);
    try { peer = new Peer(OPTS); } catch (e) { setTimeout(() => h.fail('Network not available on this browser.'), 0); }
    if (peer) {
      peer.on('open', () => {
        conn = peer.connect(PREFIX + code, { reliable: true });
        conn.on('open', () => { opened = true; clearTimeout(watchdog); h.open(); });
        conn.on('data', d => { if (!closed) h.message(d); });
        conn.on('close', () => { if (!closed) h.lost('closed'); });
        conn.on('error', () => { if (!closed) h.lost('error'); });
      });
      peer.on('error', err => {
        if (closed) return;
        clearTimeout(watchdog);
        if (err.type === 'peer-unavailable') h.fail('Room ' + code + ' not found. Check the code on the big screen.');
        else h.lost(err.type);
      });
    }
    return {
      send(msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) { /* reconnect will handle it */ } },
      close() { closed = true; clearTimeout(watchdog); try { if (peer) peer.destroy(); } catch (e) { /* already closed */ } },
      isOpen() { return !!(conn && conn.open); },
    };
  };
})();
