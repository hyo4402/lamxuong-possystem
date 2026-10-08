/**
 * Cầu nối: giả lập google.script.run để giao diện cũ chạy được ngoài Apps Script.
 * Mỗi lệnh gọi -> POST {fn, args, pin} tới Web App API (Apps Script) -> nhận JSON {ok, data|error}.
 * Content-Type text/plain để trình duyệt không gửi yêu cầu kiểm tra CORS (preflight).
 */
(function () {
  // Google thỉnh thoảng làm rớt kết nối ở bước trả kết quả (máy chủ vẫn chạy xong).
  // -> tự gửi lại tối đa 2 lần. createOrder an toàn vì có mã chống trùng (rid) xử lý ở Api.gs.
  const NO_RETRY = { saveBillFile: 1 };
  function call(fn, args, attempt) {
    attempt = attempt || 0;
    return once(fn, args).catch(function (e) {
      if (e.network && !NO_RETRY[fn] && attempt < 2) {
        return new Promise(function (r) { setTimeout(r, 800 * (attempt + 1)); }).then(function () { return call(fn, args, attempt + 1); });
      }
      throw e;
    });
  }
  function once(fn, args) {
    if (!window.API_URL || /PASTE_/.test(window.API_URL)) return Promise.reject(new Error('Chưa cấu hình API_URL trong config.js'));
    let pin = '';
    try { pin = typeof PIN !== 'undefined' ? PIN : ''; } catch (e) {}
    return fetch(window.API_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args, pin: pin })
    }).then(function (r) {
      if (!r.ok) throw new Error('Lỗi kết nối máy chủ (' + r.status + ')');
      return r.json();
    }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || 'Lỗi không xác định');
      return j.data;
    }, function (e) {
      const net = /Failed to fetch|NetworkError|Load failed/.test(e.message);
      const err = new Error(net ? 'Mất kết nối mạng, thử lại' : e.message);
      err.network = net;
      throw err;
    });
  }
  function runner() {
    let ok = function () {}, fail = function () {};
    const p = new Proxy({}, {
      get: function (_, k) {
        if (k === 'withSuccessHandler') return function (f) { ok = f; return p; };
        if (k === 'withFailureHandler') return function (f) { fail = f; return p; };
        if (k === 'withUserObject') return function () { return p; };
        return function () { const a = Array.prototype.slice.call(arguments); call(k, a).then(ok, fail); };
      }
    });
    return p;
  }
  window.google = { script: { get run() { return runner(); }, host: { close: function () {} } } };
})();
