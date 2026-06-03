$(document).ready(function () {
  window.CONTENT.verifying_blurb = '';

  var resendTimerInterval = null;
  var RESEND_COOLDOWN = 60;

  function startResendTimer(seconds) {
    if (resendTimerInterval) clearInterval(resendTimerInterval);

    var remaining = seconds || RESEND_COOLDOWN;
    var $btn = $('#phoneVerificationControl_but_send_new_code');
    var label = $btn.text().replace(/\s*\(\d+s\)$/, '').trim() || 'Resend code';

    $btn.text(label + ' (' + remaining + 's)');
    $btn.css({ 'pointer-events': 'none', 'opacity': '0.6' });

    resendTimerInterval = setInterval(function () {
      remaining--;
      if (remaining <= 0) {
        clearInterval(resendTimerInterval);
        resendTimerInterval = null;
        $btn.text(label);
        $btn.css({ 'pointer-events': '', 'opacity': '' });
      } else {
        $btn.text(label + ' (' + remaining + 's)');
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

  function showError(message) {
    var $error = $('#error');
    $error.text(message).show();
  }

  function clearError() {
    $('#error').text('').hide();
  }

  function observeThrottleErrors() {
    var observer = new MutationObserver(function () {
      var $pageError = $('.pageLevel .error');
      var $verifyError = $('#phoneVerificationControl_error_message');

      var errorText = '';
      if ($pageError.length && $pageError.is(':visible')) {
        errorText = $pageError.text();
      } else if ($verifyError.length && $verifyError.is(':visible')) {
        errorText = $verifyError.text();
      }

      if (!errorText) return;

      var throttleSeconds = parseThrottleSeconds(errorText);
      if (throttleSeconds) {
        showError('Too many attempts. Please try again in ' + throttleSeconds + ' seconds.');
        startResendTimer(throttleSeconds);
      } else if (errorText.toLowerCase().indexOf('expired') !== -1) {
        showError('The code has expired. Please request a new one.');
      } else if (errorText.toLowerCase().indexOf('invalid') !== -1 || errorText.toLowerCase().indexOf('incorrect') !== -1) {
        showError('The code you entered is incorrect. Please try again.');
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }

  function waitForElementVisible(selector) {
    return new Promise(function (resolve) {
      if ($(selector).is(':visible')) {
        resolve();
        return;
      }

      var observer = new MutationObserver(function (mutations, obs) {
        if ($(selector).is(':visible')) {
          obs.disconnect();
          resolve();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    });
  }

  function waitForButtonEnabled(buttonId) {
    return new Promise(function (resolve) {
      var button = document.getElementById(buttonId);

      if (button && button.getAttribute('aria-disabled') === 'false') {
        resolve(button);
        return;
      }

      var observer = new MutationObserver(function (mutations, obs) {
        var button = document.getElementById(buttonId);
        if (button && button.getAttribute('aria-disabled') === 'false') {
          obs.disconnect();
          resolve(button);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-disabled'],
      });
    });
  }

  function setupAutoSubmitOTP() {
    var $codeInput = $('#phoneVerificationControl_but_verify_code').closest('form').find('input[type="text"]');
    if (!$codeInput.length) {
      $codeInput = $('[id*="verificationCode"]');
    }

    if ($codeInput.length) {
      $codeInput.attr('maxlength', '6');
      $codeInput.attr('inputmode', 'numeric');
      $codeInput.attr('autocomplete', 'one-time-code');

      $codeInput.on('input', function () {
        var value = this.value.replace(/\D/g, '');
        if (value.length === 6) {
          clearError();
          setTimeout(function () {
            $('#phoneVerificationControl_but_verify_code').click();
          }, 150);
        }
      });
    }
  }

  $('#phoneVerificationControl_but_send_code').on('click', async function () {
    clearError();
    await waitForElementVisible('.verificationCode_li');

    var introMessage = window.SA_FIELDS &&
      window.SA_FIELDS.AttributeFields &&
      window.SA_FIELDS.AttributeFields[0] &&
      window.SA_FIELDS.AttributeFields[0].DISPLAY_CONTROL_CONTENT &&
      window.SA_FIELDS.AttributeFields[0].DISPLAY_CONTROL_CONTENT.intro_msg;

    if (introMessage) {
      $('#api h1').text(introMessage);
    } else {
      $('#api h1').text('Enter your verification code');
    }

    $('.phone_li').addClass('none');
    $('.intro').addClass('none');
    startResendTimer();
    setupAutoSubmitOTP();
  });

  $('#phoneVerificationControl_but_send_new_code').on('click', function () {
    clearError();
    startResendTimer();
  });

  $('#phoneVerificationControl_but_verify_code').on('click', async function () {
    clearError();
    await waitForElementVisible('#phoneVerificationControl_but_change_claims');

    $('.phoneVerificationCode_li').addClass('none');
    $('#phoneVerificationControl').addClass('none');
  });

  waitForElementVisible('#phoneVerificationControl_but_send_code').then(function () {
    if ($('#phone').val().trim() !== '') {
      $('#phoneVerificationControl_but_send_code').click();
    }
  });

  waitForButtonEnabled('continue').then(function (button) {
    $('#verifying_blurb').addClass('working');
    setTimeout(function () {
      button.click();
    }, 0);
    waitForElementVisible('#claimVerificationServerError').then(function () {
      $('#verifying_blurb').removeClass('working');
    });
  });

  observeThrottleErrors();
});
