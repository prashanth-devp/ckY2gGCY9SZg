$(document).ready(function () {
  window.CONTENT.verifying_blurb = '';

  (function preventApiHide() {
    var apiEl = document.getElementById('api');
    if (!apiEl) return;

    var observer = new MutationObserver(function () {
      if (apiEl.style.display === 'none') {
        apiEl.style.display = '';
      }
    });

    observer.observe(apiEl, { attributes: true, attributeFilter: ['style'] });
  })();

  var resendTimerInterval = null;

  function startResendTimer() {
    if (resendTimerInterval) clearInterval(resendTimerInterval);

    var $btn = $('#phoneVerificationControl_but_send_new_code');
    var label = $btn.text().replace(/\s*\(\d+s\)$/, '').trim() || 'Resend code';
    var remaining = 60;

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

  function waitForElement(selector) {
    return new Promise((resolve) => {
      if (document.querySelector(selector)) {
        resolve();
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        if (document.querySelector(selector)) {
          obs.disconnect();
          resolve();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }

  function waitForElementVisible(selector) {
    return new Promise((resolve) => {
      if ($(selector).is(':visible')) {
        resolve();
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
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
    return new Promise((resolve) => {
      const button = document.getElementById(buttonId);

      if (button && button.getAttribute('aria-disabled') !== 'true' && !button.disabled) {
        resolve(button);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const button = document.getElementById(buttonId);
        if (button && button.getAttribute('aria-disabled') !== 'true' && !button.disabled) {
          obs.disconnect();
          resolve(button);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-disabled', 'disabled'],
      });
    });
  }

  $(document).on('click', '#phoneVerificationControl_but_send_code', async function () {
    await waitForElementVisible('.verificationCode_li');

    $('#api').show();
    const introMessage = window?.SA_FIELDS.AttributeFields[0]?.DISPLAY_CONTROL_CONTENT?.intro_msg;
    if (introMessage) {
      $('#api h1').text(introMessage);
    }

    $('.phone_li').addClass('none');
    $('.intro').addClass('none');
    startResendTimer();
  });

  $(document).on('click', '#phoneVerificationControl_but_send_new_code', function () {
    startResendTimer();
  });

  (function blockEmptyCodeVerify() {
    document.addEventListener('click', function (e) {
      var btn = document.getElementById('phoneVerificationControl_but_verify_code');
      if (e.target === btn || (btn && btn.contains(e.target))) {
        var codeInput = document.getElementById('verificationCode');
        if (!codeInput || !codeInput.value.trim()) {
          e.stopImmediatePropagation();
          e.preventDefault();
          var errorEl = codeInput
            ? codeInput.closest('.attrEntry').querySelector('.error.itemLevel')
            : null;
          if (errorEl) {
            errorEl.textContent = 'This field is required';
            errorEl.classList.add('show');
            errorEl.setAttribute('aria-hidden', 'false');
          }
        }
      }
    }, true);
  })();

  function checkVerificationState() {
    var changeBtn = document.getElementById('phoneVerificationControl_but_change_claims');
    if (changeBtn && changeBtn.style.display !== 'none' && changeBtn.getAttribute('aria-hidden') !== 'true') {
      return 'success';
    }
    var errorEl = document.getElementById('phoneVerificationControl_error_message');
    if (errorEl && errorEl.style.display !== 'none' && errorEl.textContent.trim()) {
      return 'error';
    }
    return null;
  }

  function waitForVerificationResult() {
    return new Promise(function (resolve) {
      var immediate = checkVerificationState();
      if (immediate) {
        resolve(immediate);
        return;
      }

      var pollInterval = setInterval(function () {
        var result = checkVerificationState();
        if (result) {
          clearInterval(pollInterval);
          if (observer) observer.disconnect();
          resolve(result);
        }
      }, 200);

      var observer = new MutationObserver(function () {
        var result = checkVerificationState();
        if (result) {
          clearInterval(pollInterval);
          observer.disconnect();
          resolve(result);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'aria-hidden'],
      });
    });
  }

  $(document).on('click', '#phoneVerificationControl_but_verify_code', async function () {
    var codeValue = $('#verificationCode').val();
    if (!codeValue || !codeValue.trim()) {
      return;
    }

    var result = await waitForVerificationResult();

    if (result === 'error') {
      $('#phoneVerificationControl').removeClass('none');
      $('.phoneVerificationCode_li').removeClass('none');
      return;
    }

    $('#phoneVerificationControl_success_message').hide();
    $('.phoneVerificationCode_li').addClass('none');
    $('#phoneVerificationControl').addClass('none');
    $('.phone_li').addClass('none');

    var continueBtn = document.getElementById('continue');
    if (continueBtn) {
      await waitForButtonEnabled('continue');
      await new Promise(function (r) { setTimeout(r, 1000); });
      $('#attributeVerification > .buttons').css('display', 'flex');
      continueBtn.click();
      waitForElementVisible('#claimVerificationServerError').then(function () {
        var $err = $('#claimVerificationServerError');
        var errText = ($err.text() || '').toLowerCase();
        if (errText.indexOf('already exists') !== -1 || errText.indexOf('specified id') !== -1) {
          $err.text('An account already exists with this phone number.');
        }
        $('#api').show();
        $('#phoneVerificationControl').removeClass('none');
        $('.phoneVerificationCode_li').removeClass('none');
        $('.phone_li').removeClass('none');
      });
    }
  });

  // Resolves true once #phone has a value, false after a short timeout. On pages where the
  // phone is prefilled server-side (from the claim) this resolves immediately; on phone
  // sign-in the number is injected client-side (from sessionStorage) a moment after render,
  // so we wait for it before auto-sending — otherwise the one-shot check below would miss it.
  function waitForPhoneValue() {
    return new Promise((resolve) => {
      if ($('#phone').val().trim() !== '') {
        resolve(true);
        return;
      }

      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        clearInterval(pollInterval);
        clearTimeout(timeout);
        observer.disconnect();
        resolve(value);
      };

      const check = () => {
        if ($('#phone').val().trim() !== '') done(true);
      };

      const pollInterval = setInterval(check, 100);
      const timeout = setTimeout(() => done(false), 5000);
      const observer = new MutationObserver(check);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['value'],
      });
    });
  }

  waitForElementVisible('#phoneVerificationControl_but_send_code').then(async () => {
    const hasPhone = await waitForPhoneValue();
    if (hasPhone) {
      $('#phoneVerificationControl_but_send_code').click();
    }
  });
});
