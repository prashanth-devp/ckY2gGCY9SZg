// Phone SIGN-UP OTP driver.
//
// This is the sign-up counterpart to verify-phone-code.js. The sign-in page uses
// the Azure-MFA VerificationControl whose DisplayControl Id is "phoneVerificationControl"
// (claims: phone / verificationCode). The sign-up page uses the custom REST OTP
// VerificationControl whose DisplayControl Id is "phoneVerificationControl.CustomOTP"
// (claims: phoneNumberReadOnly / otpCode).
//
// Because the control Id contains a dot, Azure B2C emits element ids like
// "phoneVerificationControl.CustomOTP_but_send_code". The shared verify-phone-code.js
// is hardcoded to the "phoneVerificationControl" prefix and the "phone"/"verificationCode"
// claim ids, so none of its selectors match here — the auto "Send code" never fires
// (no OTP is sent) and the raw control buttons stay visible. This file mirrors the
// proven sign-in logic but targets the .CustomOTP control's ids.
$(document).ready(function () {
  window.CONTENT.verifying_blurb = '';

  // Sign-up control specifics. CTRL_ESC escapes the dot for CSS/jQuery selectors;
  // getElementById is used with the raw (unescaped) id where convenient.
  var CTRL = 'phoneVerificationControl.CustomOTP';
  var CTRL_ESC = 'phoneVerificationControl\\.CustomOTP';
  var CODE_INPUT_ID = 'otpCode';
  var CODE_LI = '.otpCode_li';
  var PHONE_LI = '.phoneNumberReadOnly_li';

  var SEL_SEND_CODE = '#' + CTRL_ESC + '_but_send_code';
  var SEL_SEND_NEW_CODE = '#' + CTRL_ESC + '_but_send_new_code';
  var SEL_SUCCESS_MSG = '#' + CTRL_ESC + '_success_message';
  var SEL_CONTROL = '#' + CTRL_ESC;
  var ID_VERIFY_CODE = CTRL + '_but_verify_code';
  var ID_CHANGE_CLAIMS = CTRL + '_but_change_claims';
  var ID_ERROR_MSG = CTRL + '_error_message';

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

    var $btn = $(SEL_SEND_NEW_CODE);
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

  $(SEL_SEND_CODE).on('click', async function () {
    await waitForElementVisible(CODE_LI);

    $('#api').show();
    const introMessage = window?.SA_FIELDS.AttributeFields[0]?.DISPLAY_CONTROL_CONTENT?.intro_msg;
    if (introMessage) {
      $('#api h1').text(introMessage);
    }

    $(PHONE_LI).addClass('none');
    $('.intro').addClass('none');
    startResendTimer();
  });

  $(SEL_SEND_NEW_CODE).on('click', function () {
    startResendTimer();
  });

  (function blockEmptyCodeVerify() {
    document.addEventListener('click', function (e) {
      var btn = document.getElementById(ID_VERIFY_CODE);
      if (e.target === btn || (btn && btn.contains(e.target))) {
        var codeInput = document.getElementById(CODE_INPUT_ID);
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
    var changeBtn = document.getElementById(ID_CHANGE_CLAIMS);
    if (changeBtn && changeBtn.style.display !== 'none' && changeBtn.getAttribute('aria-hidden') !== 'true') {
      return 'success';
    }
    var errorEl = document.getElementById(ID_ERROR_MSG);
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

  $(document).on('click', '#' + CTRL_ESC + '_but_verify_code', async function () {
    var codeValue = $('#' + CODE_INPUT_ID).val();
    if (!codeValue || !codeValue.trim()) {
      return;
    }

    var result = await waitForVerificationResult();

    if (result === 'error') {
      $(SEL_CONTROL).removeClass('none');
      $(CODE_LI).removeClass('none');
      return;
    }

    $(SEL_SUCCESS_MSG).hide();
    $(CODE_LI).addClass('none');
    $(SEL_CONTROL).addClass('none');
    $(PHONE_LI).addClass('none');

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
        $(SEL_CONTROL).removeClass('none');
        $(CODE_LI).removeClass('none');
        $(PHONE_LI).removeClass('none');
      });
    }
  });

  // On sign-up the phone number was captured in the previous step and is pre-filled
  // (phoneNumberReadOnly = {Claim:phone}), so request the OTP automatically on load.
  waitForElementVisible(SEL_SEND_CODE).then(() => {
    $(SEL_SEND_CODE).click();
  });
});
