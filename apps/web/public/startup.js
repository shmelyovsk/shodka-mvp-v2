(function () {
  var root = document.getElementById('root');
  var failed = false;
  var phrases=['Можно прийти одному. В этом и идея.','Проверяем, кто взял мяч.','Кто-то тоже ищет, с кем поиграть.'];
  var phraseIndex=0;
  var phraseTimer=setInterval(function(){var target=root.querySelector('.startup-phrase');if(target){phraseIndex=(phraseIndex+1)%phrases.length;target.textContent=phrases[phraseIndex];}},9000);
  function fail(code) {
    if (failed) return;
    failed = true; clearInterval(phraseTimer);
    // Only a fixed diagnostic code and timestamp; no user data, URLs or auth tokens.
    try { localStorage.setItem('shodka-startup-error', JSON.stringify({code: code, at: new Date().toISOString()})); } catch (_) {}
    root.textContent = '';
    var panel = document.createElement('section'); panel.className = 'startup-screen'; panel.setAttribute('role', 'alert');
    var title = document.createElement('h1'); title.textContent = 'Не удалось открыть СХОДКУ';
    var text = document.createElement('p'); text.textContent = 'Проверьте подключение к интернету и попробуйте ещё раз. Если ошибка повторяется, сообщите код в поддержку.';
    var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Повторить загрузку'; retry.onclick = function () { location.reload(); };
    var detail = document.createElement('small'); detail.textContent = 'Код: ' + code;
    panel.appendChild(title); panel.appendChild(text); panel.appendChild(retry); panel.appendChild(detail); root.appendChild(panel);
  }
  var timer = setTimeout(function () { if (!root.dataset.mounted) fail('START_TIMEOUT'); }, 20000);
  window.ShodkaStartup = {fail: fail, mounted: function () { clearInterval(phraseTimer); clearTimeout(timer); root.dataset.mounted = 'true'; }};
  window.addEventListener('error', function (event) {
    if (event.target && event.target.tagName === 'SCRIPT') {
      var src = event.target.getAttribute('src') || '';
      if (src.indexOf('/assets/') === 0 || src.indexOf('/src/main') === 0) fail('APP_BUNDLE');
    }
  }, true);
  function sdk(src) {
    return new Promise(function (resolve) {
      var script = document.createElement('script'); script.src = src; script.async = true;
      var done = false;
      function finish() { if (!done) { done = true; clearTimeout(timeout); resolve(); } }
      var timeout = setTimeout(finish, 8000); script.onload = finish; script.onerror = finish; document.head.appendChild(script);
    });
  }
  // Load independently; a blocked MAX CDN cannot hold up Telegram (or vice versa).
  var telegram = sdk('https://telegram.org/js/telegram-web-app.js');
  var max = sdk('https://st.max.ru/js/max-web-app.js');
  var hash = new URLSearchParams(location.hash.slice(1));
  window.ShodkaPlatformReady = hash.has('tgWebAppData') ? telegram : hash.has('WebAppData') ? max : Promise.resolve();
})();
