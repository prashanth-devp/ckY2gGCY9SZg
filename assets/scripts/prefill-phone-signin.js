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
})();
