(function () {
  var KEY = 'b2c_collected_phone';
  var carried;
  try { carried = sessionStorage.getItem(KEY); } catch (e) { return; }
  if (!carried) return;
  try { sessionStorage.removeItem(KEY); } catch (e) {}

  var digits = carried.replace(/\D/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') {
    digits = digits.slice(1);
  }
  if (digits.length !== 10) return;
  var e164 = '+1' + digits;

  function formatted(d) {
    return '+1 ' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6, 10);
  }

  function setNativeValue(input, value) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  var tries = 0;
  var MAX_TRIES = 100;
  var timer = setInterval(function () {
    tries++;

    // Stop once the code-entry step is actually on screen. B2C hides this row
    // with an inline `display:none` (not the `.none` class), so we must test real
    // visibility (offsetParent is null when the element or an ancestor is hidden);
    // a `:not(.none)` check false-matches the hidden row and bails before filling.
    var codeLi = document.querySelector('.verificationCode_li');
    if (codeLi && codeLi.offsetParent !== null) {
      clearInterval(timer);
      return;
    }

    var phone = document.getElementById('phone');
    if (phone && phone.value !== e164) {
      setNativeValue(phone, e164);
    }

    var display = document.getElementById('formatted-phone');
    if (display && !display.value) {
      display.value = formatted(digits);
    }

    if (tries >= MAX_TRIES) {
      clearInterval(timer);
    }
  }, 100);

  // --- Send-failure hand-off ------------------------------------------------
  // The code is auto-sent on load (verify-phone-code.js). If that send fails
  // before the user can do anything — e.g. Azure MFA throttling ("too many
  // attempts, try again in N seconds") — stranding them on this screen is a
  // dead end. A number was carried here, so we came from the sign-in screen:
  // stash the message and route back so it shows there instead (mirrors how the
  // number itself was handed off via sessionStorage).
  var ERROR_KEY = 'b2c_signin_error';
  var settled = false;
  var successObserver;
  var errorObserver;

  function stopWatching() {
    settled = true;
    if (errorObserver) errorObserver.disconnect();
    if (successObserver) successObserver.disconnect();
  }

  function visibleErrorText() {
    var els = [
      document.getElementById('phoneVerificationControl_error_message'),
      document.querySelector('.pageLevel .error'),
    ];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      // offsetParent is null when the element (or an ancestor) is display:none,
      // so this only matches an error that is actually on screen.
      if (el && el.offsetParent !== null && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return '';
  }

  function buildMessage(text) {
    var m = text.match(/(\d+)\s*second/i) || text.match(/try again in\s*(\d+)/i);
    if (m) return 'Too many attempts. Please try again in ' + m[1] + ' seconds.';
    if (/too many/i.test(text)) return 'Too many attempts. Please try again later.';
    return text || "We couldn't send a verification code. Please try again.";
  }

  var observeConfig = { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] };

  // A successful send reveals the code-entry row; once that happens the send
  // stage is over, so we stop watching (any later verify errors — wrong code,
  // account-not-found — stay on this page, as they should).
  successObserver = new MutationObserver(function () {
    var codeLi = document.querySelector('.verificationCode_li');
    if (codeLi && codeLi.offsetParent !== null) stopWatching();
  });
  successObserver.observe(document.body, observeConfig);

  errorObserver = new MutationObserver(function () {
    if (settled) return;
    var text = visibleErrorText();
    if (!text) return;
    stopWatching();
    try { sessionStorage.setItem(ERROR_KEY, buildMessage(text)); } catch (e) {}
    window.history.back();
  });
  errorObserver.observe(document.body, observeConfig);
})();
