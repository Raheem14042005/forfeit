// FORFEIT start page and routing.
window.FF = window.FF || {};
(function () {
  const U = FF.u;
  function landing() {
    const q = new URLSearchParams(location.search);
    const room = (q.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (room) return FF.phone.showJoin({ code: room, auto: true });
    if (q.has('host')) return FF.host.start();
    if (q.has('join')) return FF.phone.showJoin({});
    const hostCard = '<div class="choice"><h2>📺 Host on this screen</h2><p>Laptop, TV, or share your screen on a call. Everyone joins with a room code.</p><button class="btn big" id="host">Host a game</button></div>';
    const joinCard = '<div class="choice"><h2>📱 Join on your phone</h2><p>Got a code from the big screen? Tap here.</p><button class="btn big red" id="join">Join a game</button></div>';
    U.$('#app').innerHTML =
      '<div class="landing">' +
      '<div class="logo">FORFEIT<span class="bang">!</span></div>' +
      '<div class="tag">The party game where the <b>loser does a forfeit</b>. One big screen, everyone plays on their phone.</div>' +
      '<div class="choices">' + (U.isTouch() ? joinCard + hostCard : hostCard + joinCard) + '</div>' +
      '<div class="steps">' +
      '<div class="step"><b>1.</b> One person hosts on a big screen, or shares it on a video call.</div>' +
      '<div class="step"><b>2.</b> Everyone joins on their phone with the 4 letter code. 3 to 10 players.</div>' +
      '<div class="step"><b>3.</b> Snake, Hot Takes, Most Likely To and Who Wrote That. Last place spins the forfeit wheel.</div>' +
      '</div><div class="foot">No app, no account, no sign up.</div></div>';
    U.$('#host').addEventListener('click', () => { FF.audio.unlock(); FF.host.start(); });
    U.$('#join').addEventListener('click', () => { FF.audio.unlock(); FF.phone.showJoin({}); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', landing); else landing();
})();
