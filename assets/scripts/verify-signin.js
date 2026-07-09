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
    var label =
      $btn
        .text()
        .replace(/\s*\(\d+s\)$/, '')
        .trim() || 'Resend code';
    var remaining = 60;

    $btn.text(label + ' (' + remaining + 's)');
    $btn.css({ 'pointer-events': 'none', opacity: '0.6' });

    resendTimerInterval = setInterval(function () {
      remaining--;
      if (remaining <= 0) {
        clearInterval(resendTimerInterval);
        resendTimerInterval = null;
        $btn.text(label);
        $btn.css({ 'pointer-events': '', opacity: '' });
      } else {
        $btn.text(label + ' (' + remaining + 's)');
      }
    }, 1000);
  }

  function showVerificationCodeStep() {
    $('#api').show();
    $('#api h1').text('Enter verification code');
    $('#emailVerificationControl_success_message').show();
    $('.email_li').addClass('none');
    $('.intro').addClass('none');
    startResendTimer();
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
      try {
        stored = sessionStorage.getItem('b2c_collected_phone');
      } catch (e) {}
      if (stored) {
        try {
          sessionStorage.removeItem('b2c_collected_phone');
        } catch (e) {}
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
        setTimeout(function () {
          button.click();
        }, 0);
        waitForElementVisible('#claimVerificationServerError').then(function () {
          $('#api').show();
        });
      });
      return;
    }

    $('.container').append(
      '<div id="loading-indicator" style="text-align:center;padding:2rem;"><div class="spinner"></div></div>',
    );

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

  $(document).on('click', '#emailVerificationControl_but_send_code', async function () {
    await waitForElementVisible('.verificationCode_li');

    showVerificationCodeStep();

    if ($('.reenterPassword_li').length && $('.newPassword_li').length) {
      $('#continue').hide();
    }
  });

  $(document).on('click', '#emailVerificationControl_but_send_new_code', function () {
    $('#emailVerificationControl_success_message').show();
    startResendTimer();
  });

  $(document).on('click', '#emailVerificationControl_but_verify_code', async function () {
    $('#emailVerificationControl_success_message').hide();
    await waitForElementVisible('#emailVerificationControl_success_message');

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
      $('#continue').show();
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
      var emailControl = document.getElementById('emailVerificationControl');
      var emailVerified = $('#emailVerificationControl_success_message').is(':visible');
      if (emailControl && !emailVerified) {
        return;
      }
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

    $('.container').append(
      '<div id="loading-indicator" style="text-align:center;padding:2rem;"><div class="spinner"></div></div>',
    );
    setTimeout(function () {
      button.click();
    }, 0);
    waitForElementVisible('#claimVerificationServerError').then(function () {
      $('#loading-indicator').remove();
    });
  });

  waitForElementVisible('#emailVerificationControl_but_send_code').then(() => {
    var emailVal = $('#email').val();
    if (!emailVal || !emailVal.length) {
      try {
        var stored = sessionStorage.getItem('b2c_collected_email');
        if (stored) {
          var emailInput = document.getElementById('email');
          var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(emailInput, stored);
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));
          emailVal = stored;
          sessionStorage.removeItem('b2c_collected_email');
        }
      } catch (ex) {}
    }
    if (emailVal && emailVal.length) {
      var verifyCodeLi = document.querySelector('.verificationCode_li');
      if (verifyCodeLi && verifyCodeLi.style.display !== 'none') {
        showVerificationCodeStep();
        return;
      }
      $('.email_li').addClass('none');
      $('.intro').addClass('none');
      setTimeout(function () {
        $('#emailVerificationControl_but_send_code').click();
      }, 500);
    }
  });

  waitForElement('#emailVerificationControl').then(function () {
    var sendCodeEl = document.getElementById('emailVerificationControl_but_send_code');
    var verifyCodeLi = document.querySelector('.verificationCode_li');
    var sendCodeHidden = sendCodeEl && sendCodeEl.style.display === 'none';
    var verifyCodeVisible = verifyCodeLi && verifyCodeLi.style.display !== 'none';

    if (verifyCodeVisible && sendCodeHidden) {
      showVerificationCodeStep();
    }
  });
});
 