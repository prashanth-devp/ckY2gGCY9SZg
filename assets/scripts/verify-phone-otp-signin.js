$(document).ready(function () {
  var resendTimerInterval = null;
  var RESEND_COOLDOWN = 60;

  function startResendTimer(seconds) {
    if (resendTimerInterval) clearInterval(resendTimerInterval);

    var remaining = seconds || RESEND_COOLDOWN;
    var $cancel = $('#cancel');
    var baseLabel = 'Resend code';

    $cancel.text(baseLabel + ' (' + remaining + 's)');
    $cancel.css({ 'pointer-events': 'none', 'opacity': '0.6' });

    resendTimerInterval = setInterval(function () {
      remaining--;
      if (remaining <= 0) {
        clearInterval(resendTimerInterval);
        resendTimerInterval = null;
        $cancel.text(baseLabel);
        $cancel.css({ 'pointer-events': '', 'opacity': '' });
      } else {
        $cancel.text(baseLabel + ' (' + remaining + 's)');
      }
    }, 1000);
  }

  function parseThrottleSeconds(errorText) {
    var match = errorText.match(/(\d+)\s*second/i);
    if (match) return parseInt(match[1], 10);
    match = errorText.match(/try again in\s*(\d+)/i);
    if (match) return parseInt(match[1], 10);
    return null;
  }

  function observeErrors() {
    var observer = new MutationObserver(function () {
      var $pageError = $('.pageLevel .error');
      var $fieldError = $('[id$="_error_message"]');

      var errorText = '';
      if ($pageError.length && $pageError.is(':visible')) {
        errorText = $pageError.text();
      } else if ($fieldError.length && $fieldError.is(':visible')) {
        errorText = $fieldError.text();
      }

      if (!errorText) return;

      var throttleSeconds = parseThrottleSeconds(errorText);
      if (throttleSeconds) {
        startResendTimer(throttleSeconds);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }

  function setupAutoSubmit() {
    var $codeInput = $('[id*="otpCode"], [id*="verificationCode"]').first();
    if (!$codeInput.length) return;

    $codeInput.attr('maxlength', '6');
    $codeInput.attr('inputmode', 'numeric');
    $codeInput.attr('autocomplete', 'one-time-code');

    $codeInput.on('input', function () {
      var value = this.value.replace(/\D/g, '');
      this.value = value;
      if (value.length === 6) {
        setTimeout(function () {
          $('#continue').click();
        }, 150);
      }
    });
  }

  // Relabel cancel link as "Resend code" so user knows they can go back to re-send OTP.
  $('#cancel').text('Resend code');

  // Start the resend countdown on page load — OTP was sent when the previous step submitted.
  startResendTimer();

  setupAutoSubmit();
  observeErrors();
});
