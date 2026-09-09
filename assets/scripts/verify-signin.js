$(document).ready(function () {
  window.CONTENT.verifying_blurb = '';
  var emailVerificationConfirmed = false;

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

  var RESEND_COOLDOWN_MS = 60 * 1000;
  var RESEND_COOLDOWN_KEY = 'b2c_otp_resend_until';
  var resendCountdownInterval = null;

  function otpControl(suffix) {
    return $('[id^="emailVerificationControl"][id$="' + suffix + '"]');
  }

  function trackResend(outcome) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(['event', 'otp_resend', { feature_id: 'otp1_resend_cooldown', outcome: outcome }]);
  }

  function announceResendStatus(message) {
    var $live = $('#otp-resend-status');
    if (!$live.length) {
      $live = $(
        '<div id="otp-resend-status" role="status" ' +
          'style="position:absolute;width:1px;height:1px;overflow:hidden;"></div>',
      );
      $(document.body).append($live);
    }
    $live.text(message);
  }

  function waitForSendOutcome() {
    var initialSuccessText = otpControl('_success_message').text().trim();
    return new Promise(function (resolve) {
      var settled = false;
      function done(outcome) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        observer.disconnect();
        resolve(outcome);
      }
      function check() {
        var $error = otpControl('_error_message');
        if ($error.length && $error.is(':visible') && $error.text().trim().length > 0) {
          done('failed');
          return;
        }
        var $success = otpControl('_success_message');
        var currentText = $success.text().trim();
        if ($success.length && $success.is(':visible') && currentText !== initialSuccessText) {
          done('accepted');
        }
      }
      var observer = new MutationObserver(check);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
      var timeout = setTimeout(function () {
        done('failed');
      }, 10000);
    });
  }

  function showSendConfirmation(sentAt) {
    var timeText = sentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    $('#otp-sent-at').remove();
    otpControl('_success_message')
      .show()
      .after('<p id="otp-sent-at">✓ Code sent at ' + timeText + '</p>');
  }

  function updateCountdownText(secondsLeft) {
    var $countdown = $('#otp-resend-countdown');
    var text = 'You can request a new code in ' + secondsLeft + 's';
    if (!$countdown.length) {
      otpControl('_but_send_new_code').after('<p id="otp-resend-countdown" aria-hidden="true">' + text + '</p>');
    } else {
      $countdown.text(text);
    }
  }

  function applyResendCooldownUi(active) {
    var $btn = otpControl('_but_send_new_code');
    if (active) {
      $btn.text('Resend code');
      $btn.prop('disabled', true);
      $btn.attr('aria-disabled', 'true');
      $btn.attr('aria-label', 'Resend code, available in about a minute');
    } else {
      $btn.prop('disabled', false);
      $btn.removeAttr('aria-disabled');
      $btn.removeAttr('aria-label');
      $('#otp-resend-countdown').remove();
    }
  }

  function runCooldownTicker(cooldownUntil) {
    if (resendCountdownInterval) clearInterval(resendCountdownInterval);
    function tick() {
      var remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(resendCountdownInterval);
        resendCountdownInterval = null;
        try {
          sessionStorage.removeItem(RESEND_COOLDOWN_KEY);
        } catch (e) {}
        applyResendCooldownUi(false);
        announceResendStatus('You can request a new code now.');
        return;
      }
      updateCountdownText(remaining);
    }
    tick();
    resendCountdownInterval = setInterval(tick, 1000);
  }

  function startResendCooldown(sentAt) {
    var cooldownUntil = Date.now() + RESEND_COOLDOWN_MS;
    try {
      sessionStorage.setItem(RESEND_COOLDOWN_KEY, String(cooldownUntil));
    } catch (e) {}
    applyResendCooldownUi(true);
    announceResendStatus(
      'Code sent at ' +
        sentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) +
        '. You can request a new code in 60 seconds.',
    );
    runCooldownTicker(cooldownUntil);
  }

  function resumeResendCooldownIfActive() {
    var stored;
    try {
      stored = sessionStorage.getItem(RESEND_COOLDOWN_KEY);
    } catch (e) {}
    if (!stored) return;
    var cooldownUntil = parseInt(stored, 10);
    if (!cooldownUntil || cooldownUntil <= Date.now()) {
      try {
        sessionStorage.removeItem(RESEND_COOLDOWN_KEY);
      } catch (e) {}
      return;
    }
    applyResendCooldownUi(true);
    runCooldownTicker(cooldownUntil);
  }

  function guardResendDuringCooldown(e) {
    var stored;
    try {
      stored = sessionStorage.getItem(RESEND_COOLDOWN_KEY);
    } catch (e2) {
      stored = null;
    }
    if (stored && parseInt(stored, 10) > Date.now()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      trackResend('blocked_cooldown');
    }
  }

  var resendGuardAttachedTo = null;
  function attachResendGuard() {
    var btn = otpControl('_but_send_new_code')[0];
    if (!btn || btn === resendGuardAttachedTo) return;
    resendGuardAttachedTo = btn;
    btn.addEventListener('click', guardResendDuringCooldown, true);
    btn.addEventListener(
      'keydown',
      function (e) {
        if (e.key === 'Enter' || e.key === ' ') guardResendDuringCooldown(e);
      },
      true,
    );
  }

  function armSendOutcomeHandling(sendTriggeredAt) {
    waitForSendOutcome().then(function (outcome) {
      if (outcome === 'accepted') {
        showSendConfirmation(sendTriggeredAt);
        startResendCooldown(sendTriggeredAt);
        trackResend('accepted');
      } else {
        trackResend('send_failed');
      }
    });
  }

  var OTP_GUIDANCE_HTML =
    '<div id="otp-guidance" role="note">' +
    '<p>Not seeing it? Check spam or junk. It can take a few minutes, ' +
    'and only one code is sent at a time.</p>' +
    '</div>';

  function showOtpGuidance() {
    var flow = document.body.dataset.flow;
    if (['signin', 'signup', 'passwordless'].indexOf(flow) === -1) return;

    $('#emailVerificationControl_success_message').attr('role', 'status');

    if (!$('#otp-guidance').length) {
      $('.verificationCode_li').after(OTP_GUIDANCE_HTML);
    }

    if (!showOtpGuidance.fired) {
      showOtpGuidance.fired = true;
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(['event', 'otp_guidance_shown', { feature_id: 'otp1_wait_guidance', flow: flow }]);
    }
  }
  function showVerificationCodeStep() {
    $('#api').show();
    $('#api h1').text('Enter verification code');
    $('#emailVerificationControl_success_message').show();
    $('.email_li').addClass('none');
    $('.intro').addClass('none');
    showOtpGuidance(); // US 1.2 — already planned separately
    attachResendGuard();
    resumeResendCooldownIfActive();
    watchForEmailVerified();
  }

  function setPasswordLabel(selector, text) {
    var $label = $(selector);
    if (!$label.length) return;
    var suffix = /\*\s*$/.test($label.text()) ? '*' : '';
    $label.text(text + suffix);
  }

  function addEyeIconToPasswordFields() {
    $('#api input[type="password"]').each(function () {
      var $passwordInput = $(this);
      if ($passwordInput.data('eyeAttached')) return;

      var $wrapperItem = $passwordInput.closest('.entry-item, .attrEntry');
      if (!$wrapperItem.length) return;

      $wrapperItem.css('position', 'relative');
      $passwordInput.css('paddingRight', '36px');

      var $eyeIcon = $('<img>', {
        src: 'https://prashanth-devp.github.io/ckY2gGCY9SZg/assets/images/eye-off.svg',
        alt: 'Toggle visibility',
      }).css({
        position: 'absolute',
        right: '10px',
        bottom: '5px',
        transform: 'translateY(-50%)',
        cursor: 'pointer',
        width: '20px',
        height: '20px',
        zIndex: '2',
      });

      var visible = false;
      $eyeIcon.on('click', function () {
        visible = !visible;
        $passwordInput.attr('type', visible ? 'text' : 'password');
        $eyeIcon.attr(
          'src',
          visible
            ? 'https://prashanth-devp.github.io/ckY2gGCY9SZg/assets/images/eye.svg'
            : 'https://prashanth-devp.github.io/ckY2gGCY9SZg/assets/images/eye-off.svg',
        );
      });

      $wrapperItem.append($eyeIcon);
      $passwordInput.data('eyeAttached', 'true');
    });
  }

  function applyPasswordStepCopy() {
    $('#api h1').text('Add a new password to your account');

    var $intro = $('#api .intro');
    if (!$intro.length) {
      var $heading = $('#api .heading');
      $intro = $('<div class="intro"></div>');
      if ($heading.length) {
        $intro.insertAfter($heading);
      } else {
        $intro.insertAfter($('#api h1'));
      }
    }
    $intro.html('<h2>Enter a password for your Opal account below</h2>').removeClass('none');

    setPasswordLabel('#newPassword_label', 'Create password');
    setPasswordLabel('#reenterPassword_label', 'Confirm password');

    if (!$('.password-requirements').length) {
      var $requirements = $('<div class="password-requirements"></div>')
        .text(
          'Your password must be 8+ characters long with uppercase characters, lowercase characters and numbers (0-9)',
        )
        .css({ 'font-size': '14px', color: '#5A6A72', margin: '4px 0 16px 0' });
      var $newPasswordItem = $('#newPassword').closest('li');
      if ($newPasswordItem.length) {
        $requirements.insertAfter($newPasswordItem);
      }
    }

    $('#cancel').hide();

    var $continue = $('#continue');
    if ($continue.is('input')) {
      $continue.val('Continue to Opal');
    } else {
      $continue.text('Continue to Opal');
    }

    addEyeIconToPasswordFields();
  }

  function goToPasswordStep() {
    var rePassword = $('.reenterPassword_li');
    var newPassword = $('.newPassword_li');

    if (!rePassword.length || !newPassword.length) return;
    if (rePassword.is(':visible')) return;

    emailVerificationConfirmed = true;

    $('#emailVerificationControl_success_message').hide();
    $('.emailVerificationCode_li').addClass('none');
    $('#emailVerificationControl').addClass('none');
    $('.email_li').addClass('none');
    applyPasswordStepCopy();
    rePassword.show();
    newPassword.show();
    $('#continue').show();
    $('#attributeVerification > .buttons').css('display', 'flex');
  }

  function watchForEmailVerified() {
    if (watchForEmailVerified.started) return;
    watchForEmailVerified.started = true;

    var initialSuccessText = $('#emailVerificationControl_success_message').text().trim();
    var sawVerifyButton = false;
    var confirming = false;

    function verifyButtonVisible() {
      var btn = document.getElementById('emailVerificationControl_but_verify_code');
      return !!btn && btn.style.display !== 'none' && $(btn).is(':visible');
    }

    function errorVisible() {
      var err = document.getElementById('emailVerificationControl_error_message');
      return !!err && $(err).is(':visible') && err.textContent.trim().length > 0;
    }

    function confirmVerification() {
      confirming = true;
      var checkCount = 0;

      var interval = setInterval(function () {
        checkCount++;

        // Error: the verify button came back or an error message appeared — re-arm.
        if (verifyButtonVisible() || errorVisible()) {
          clearInterval(interval);
          confirming = false;
          return;
        }

        var currentText = $('#emailVerificationControl_success_message').text().trim();
        if ((currentText.length > 0 && currentText !== initialSuccessText) || checkCount >= 10) {
          clearInterval(interval);
          observer.disconnect();
          goToPasswordStep();
        }
      }, 300);
    }

    var observer = new MutationObserver(function () {
      if (verifyButtonVisible()) {
        sawVerifyButton = true;
        return;
      }

      if (sawVerifyButton && !confirming) {
        confirmVerification();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden'],
    });

    if (verifyButtonVisible()) {
      sawVerifyButton = true;
    }
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

    // Every OTP send — including the automatic first send — gets the same
    // confirmation + cooldown treatment as resend.
    armSendOutcomeHandling(new Date());

    if ($('.reenterPassword_li').length && $('.newPassword_li').length) {
      $('#continue').hide();
    }
  });

  $(document).on('click', '[id^="emailVerificationControl"][id$="_but_send_new_code"]', function () {
    armSendOutcomeHandling(new Date());
  });

  $(document).on('click', '#emailVerificationControl_but_verify_code', function () {
    watchForEmailVerified();
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
      if (emailControl && !emailVerificationConfirmed) {
        return;
      }
      $('#emailVerificationControl_success_message').hide();
      $('.emailVerificationCode_li').addClass('none');
      $('#emailVerificationControl').addClass('none');
      $('.email_li').addClass('none');
      applyPasswordStepCopy();
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
