// Refresh guard. The phone number is handed into this OTP screen only once, via
// sessionStorage ('b2c_collected_phone'), and it is consumed (deleted) below on
// first load. A browser refresh therefore re-renders this step with no phone
// context, which would strand the user on a half-initialized auto-advance screen
// (empty phone field + any stray verification error). On a reload we instead send
// the user back to the sign-in screen to start over cleanly. Runs before the
// prefill logic below so nothing flashes first.
(function () {
  try {
    var carried = sessionStorage.getItem('b2c_collected_phone');
    var navEntry = (performance.getEntriesByType &&
      performance.getEntriesByType('navigation')[0]) || null;
    var isReload = navEntry
      ? navEntry.type === 'reload'
      : (performance.navigation && performance.navigation.type === 1);
    if (isReload && !carried && window.history.length > 1) {
      // Hide the page so the broken OTP state never flashes before we leave.
      document.documentElement.style.visibility = 'hidden';
      window.history.back();
    }
  } catch (e) {}
})();

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
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6, 10);
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
})();
