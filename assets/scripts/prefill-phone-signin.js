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

// Error routing (phone sign-in only). Azure MFA surfaces its errors on this OTP
// screen, but per product rules number-related problems — phone-number
// validation and SMS "too many requests" throttling — must appear on the sign-in
// (first) screen, while code problems (wrong/expired OTP) stay here. This lives
// in the sign-in prefill script (loaded only by verifyMFAPhoneSignIn.html) — NOT
// in the shared verify-phone-code.js — so signup and forgot-password are left
// completely untouched.
(function () {
  var SIGNIN_ERROR_KEY = 'b2c_signin_error';
  var redirecting = false;

  // B2C toggles its error rows with `display`, so offsetParent === null reliably
  // means "not shown". Returns the trimmed text only when the element is visible.
  function textIfVisible(el) {
    if (!el || el.offsetParent === null) return '';
    return (el.textContent || '').trim();
  }

  function getErrorText() {
    return textIfVisible(document.querySelector('.pageLevel .error')) ||
      textIfVisible(document.getElementById('phoneVerificationControl_error_message'));
  }

  function hideRawErrors() {
    var pageError = document.querySelector('.pageLevel .error');
    var verifyError = document.getElementById('phoneVerificationControl_error_message');
    if (pageError) pageError.style.display = 'none';
    if (verifyError) verifyError.style.display = 'none';
  }

  function showLocalError(message) {
    var el = document.getElementById('error');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
  }

  // True once the SMS code-entry step is on screen. Before that we're still on
  // the phone-number step, so any error is about the number, not the code.
  function isCodeEntryPhase() {
    var codeInput = document.getElementById('verificationCode');
    if (codeInput && codeInput.offsetParent !== null) return true;
    var codeLi = document.querySelector('.verificationCode_li');
    return !!(codeLi && codeLi.offsetParent !== null);
  }

  function handleError() {
    if (redirecting) return;

    var errorText = getErrorText();
    if (!errorText) return;

    var lower = errorText.toLowerCase();

    // OTP/code error: only when we're on the code-entry step AND the message is
    // about the code itself (never a phone-number message).
    var isCodeError = isCodeEntryPhase() && (
      lower.indexOf('code') !== -1 ||
      lower.indexOf('expired') !== -1 ||
      lower.indexOf('incorrect') !== -1 ||
      (lower.indexOf('invalid') !== -1 &&
        lower.indexOf('phone') === -1 && lower.indexOf('number') === -1)
    );

    if (isCodeError) {
      if (lower.indexOf('expired') !== -1) {
        showLocalError('The code has expired. Please request a new one.');
      } else if (lower.indexOf('incorrect') !== -1 || lower.indexOf('invalid') !== -1) {
        showLocalError('The code you entered is incorrect. Please try again.');
      } else {
        showLocalError(errorText);
      }
      hideRawErrors();
      return;
    }

    // Otherwise it's number-related (phone validation or "too many requests") →
    // carry a friendly message to the sign-in screen and step back to it.
    var secMatch = errorText.match(/(\d+)\s*second/i) || errorText.match(/try again in\s*(\d+)/i);
    var msg;
    if (secMatch) {
      msg = 'Too many attempts. Please try again in ' + secMatch[1] + ' seconds.';
    } else if (lower.indexOf('too many') !== -1) {
      msg = 'Too many attempts. Please wait a moment and try again.';
    } else {
      msg = errorText;
    }
    hideRawErrors();

    if (window.history.length > 1) {
      redirecting = true;
      try { sessionStorage.setItem(SIGNIN_ERROR_KEY, msg); } catch (e) {}
      // Hide the page so the OTP error never flashes before we navigate away.
      document.documentElement.style.visibility = 'hidden';
      window.history.back();
    } else {
      // Nowhere to go back to (e.g. a deep link) — show it here as a fallback.
      showLocalError(msg);
    }
  }

  function start() {
    handleError(); // catch an error already present on first paint
    var observer = new MutationObserver(handleError);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }
})();
