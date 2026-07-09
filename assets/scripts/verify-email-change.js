$(document).ready(function () {
  window.CONTENT.verifying_blurb = '';

  function preventApiHide() {
    var apiEl = document.getElementById('api');
    if (!apiEl) return;

    var observer = new MutationObserver(function () {
      if (apiEl.style.display === 'none') {
        apiEl.style.display = '';
      }
    });

    observer.observe(apiEl, { attributes: true, attributeFilter: ['style'] });
  }

  preventApiHide();

  var resendTimerInterval = null;

  function startResendTimer() {
    if (resendTimerInterval) clearInterval(resendTimerInterval);

    var $btn = $('#emailVerificationControl_but_send_new_code');
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

      if (button && button.getAttribute('aria-disabled') === 'false') {
        resolve(button);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const button = document.getElementById(buttonId);
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

  function isEmailValue(value) {
    return value && value.indexOf('@') > -1;
  }

  function handlePhoneVerificationSkip() {
    var $phone = $('#phone');
    var phoneValue = ($phone.val() || '').trim();

    if (isEmailValue(phoneValue)) {
      var phoneInput = $phone[0];
      if (phoneInput) {
        var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(phoneInput, '');
        phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      phoneValue = '';
    }

    if (!phoneValue) {
      var stored;
      try { stored = sessionStorage.getItem('b2c_collected_phone'); } catch (e) {}
      if (stored) {
        try { sessionStorage.removeItem('b2c_collected_phone'); } catch (e) {}
        var phoneInput = $phone[0];
        if (phoneInput) {
          var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(phoneInput, stored);
          phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
          phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
          phoneValue = stored;
        }
      }
    }

    if (phoneValue && !isEmailValue(phoneValue)) {
      $('.phone_li').addClass('none');
      $('.intro').addClass('none');
      setTimeout(function () {
        $('#phoneVerificationControl_but_send_code').click();
      }, 300);
      waitForButtonEnabled('continue').then(function (button) {
        setTimeout(function () { button.click(); }, 0);
        waitForElementVisible('#claimVerificationServerError').then(function () {
          $('#api').show();
        });
      });
      return;
    }

    $('.container').append('<div id="loading-indicator" style="text-align:center;padding:2rem;"><div class="spinner"></div></div>');

    var skipTimeout = setTimeout(function () {
      $('#loading-indicator').remove();
      $('#api').show();
    }, 5000);

    waitForButtonEnabled('continue').then(function (button) {
      clearTimeout(skipTimeout);
      setTimeout(function () {
        button.click();
      }, 0);
      waitForElementVisible('#claimVerificationServerError').then(function () {
        $('#loading-indicator').remove();
        $('#api').show();
      });
    });
  }

  waitForElement('#phoneVerificationControl_but_send_code').then(function () {
    var emailControl = document.getElementById('emailVerificationControl');
    var emailVisible = emailControl && $(emailControl).is(':visible');
    if (!emailVisible) {
      handlePhoneVerificationSkip();
    }
  });

  var originalHeading = '';

  $(document).on('click', '#emailVerificationControl_but_send_code', async function () {
    await waitForElementVisible('.verificationCode_li');

    $('#api').show();
    if (!originalHeading) {
      originalHeading = $('#api h1').text();
    }
    const introMessage = window?.SA_FIELDS.AttributeFields[0]?.DISPLAY_CONTROL_CONTENT?.intro_msg;
    if (introMessage) {
      $('#api h1').text(introMessage);
    }

    $('.email_li').addClass('none');
    $('.intro').addClass('none');
    startResendTimer();

    // Reveal the Back link on the code step; it returns to the email-entry step via the
    // native "change email" action (the email link/change flow has no separate previous page).
    var backLink = document.getElementById('code-back-link');
    if (backLink) {
      backLink.classList.add('show');
      if (!backLink.dataset.wired) {
        backLink.dataset.wired = 'true';
        backLink.addEventListener('click', function () {
          backLink.classList.remove('show');
          $('.email_li').removeClass('none');
          $('.intro').removeClass('none');
          if (originalHeading) {
            $('#api h1').text(originalHeading);
          }
          var changeBtn = document.getElementById('emailVerificationControl_but_change_claims');
          if (changeBtn) {
            changeBtn.click();
          }
        });
      }
    }
  });

  $(document).on('click', '#emailVerificationControl_but_send_new_code', function () {
    startResendTimer();
  });

  $(document).on('click', '#emailVerificationControl_but_verify_code', async function () {
    await waitForElement('#emailVerificationControl_success_message');

    var rePassword = $('.reenterPassword_li');
    var newPassword = $('.newPassword_li');

    if (rePassword.length && newPassword.length) {
      $('#emailVerificationControl_success_message').hide();
      $('.emailVerificationCode_li').addClass('none');
      $('#emailVerificationControl').addClass('none');
      $('.email_li').addClass('none');
      $('#api h1').text('Add a password to your account');
      rePassword.show();
      newPassword.show();
      $('#attributeVerification > .buttons').css('display', 'flex');
    }
  });

  waitForButtonEnabled('continue').then((button) => {
    if (document.getElementById('phoneVerificationControl') && !document.getElementById('emailVerificationControl')) {
      return;
    }

    var sendCodeEl = document.getElementById('emailVerificationControl_but_send_code');
    var verifyCodeLi = document.querySelector('.verificationCode_li');
    if (verifyCodeLi && verifyCodeLi.style.display !== 'none' && sendCodeEl && sendCodeEl.style.display === 'none') {
      return;
    }

    var rePassword = $('.reenterPassword_li');
    var newPassword = $('.newPassword_li');

    if (rePassword.length && newPassword.length) {
      $('#emailVerificationControl_success_message').hide();
      $('.emailVerificationCode_li').addClass('none');
      $('#emailVerificationControl').addClass('none');
      $('.email_li').addClass('none');
      $('#api h1').text('Add a password to your account');
      rePassword.show();
      newPassword.show();
      $('#attributeVerification > .buttons').css('display', 'flex');
      $('#api').show();
      $('#loading-indicator').remove();
      return;
    }

    $('.container').append('<div id="loading-indicator" style="text-align:center;padding:2rem;"><div class="spinner"></div></div>');
    setTimeout(function () {
      button.click();
    }, 0);
    waitForElementVisible('#claimVerificationServerError').then(function () {
      $('#loading-indicator').remove();
    });
  });

  // NOTE: verify-signin.js's auto-send block is intentionally REMOVED here for the email
  // link/change flow. That block auto-clicked "Send verification code" whenever #email was
  // prefilled — which, combined with the emailHint prepopulation, made the page skip straight to
  // code entry. Everything else matches the current verify-signin.js so the code is still verified
  // the same way; the user reviews/edits the prefilled email and clicks "Send verification code".

  waitForElement('#emailVerificationControl').then(function () {
    var sendCodeEl = document.getElementById('emailVerificationControl_but_send_code');
    var verifyCodeLi = document.querySelector('.verificationCode_li');
    var sendCodeHidden = sendCodeEl && sendCodeEl.style.display === 'none';
    var verifyCodeVisible = verifyCodeLi && verifyCodeLi.style.display !== 'none';

    if (verifyCodeVisible && sendCodeHidden) {
      $('.email_li').addClass('none');
      $('.intro').addClass('none');
      $('#api').show();
      startResendTimer();
    }
  });
});
 