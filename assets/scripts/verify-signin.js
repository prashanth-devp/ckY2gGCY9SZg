$(document).ready(function () {
  window.CONTENT.verifying_blurb = '';
  var emailVerificationConfirmed = false;

  // A B2C display control id prefixes every DOM id that control renders. The login journeys
  // (UX-VerifyMFAEmail.SignIn / .Passwordless) render emailVerificationControlCustomOtp, whose
  // SendCode/VerifyCode actions call the Opal verification service (REST-SendEmailOTP /
  // REST-ValidateEmailOTP) so the code is sent from a Bausch + Lomb address; SignUp,
  // ForgotPassword and MFASetup still render emailVerificationControl (AadSspr). Match whichever
  // is on the page rather than hardcoding one, so reverting a journey back to
  // UX-VerifyMFAEmail.Base needs no page change.
  function sel(kind, suffix) {
    var base = kind + 'VerificationControl';
    return '#' + base + suffix + ', #' + base + 'CustomOtp' + suffix;
  }

  var EMAIL = {
    control: sel('email', ''),
    sendCode: sel('email', '_but_send_code'),
    sendNewCode: sel('email', '_but_send_new_code'),
    verifyCode: sel('email', '_but_verify_code'),
    successMessage: sel('email', '_success_message'),
    errorMessage: sel('email', '_error_message'),
  };

  var PHONE = {
    control: sel('phone', ''),
    sendCode: sel('phone', '_but_send_code'),
  };

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

  // Fallback only, for a resend whose request was not observed directly: the code field is
  // already on screen by then, so it cannot act as the success signal the way it can for the
  // first send. No error by this point means the send resolved 200.
  var SEND_ERROR_GRACE_MS = 3000;
  var SEND_TIMEOUT_MS = 15000;
  // How long our own error copy is held against B2C overwriting it (see pinErrorMessage).
  var ERROR_PIN_MS = 2000;
  // Fallback for a send that failed without any readable message - a transport error, timeout or
  // abort, where there is no response body at all. A send the Opal service itself rejects arrives
  // with its own userMessage (it replies 409 precisely so B2C forwards that copy), so this string
  // is not the normal failure path and is not expected to stay in step with the backend's wording.
  var GENERIC_SEND_ERROR = 'We were unable to send the verification code. Please try again.';
  var errorPinInterval = null;

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

  // The send request itself is the authoritative outcome signal: the verification control's
  // SendCode action posts to B2C, which calls REST-SendEmailOTP and waits for it, so by the time
  // this response lands the Opal backend has either had the message accepted by Azure
  // Communication Services or replied 409 with the reason. Watching the DOM alone cannot tell a
  // slow send from a failed one, which is how a "code sent" confirmation ends up on screen over a
  // send that never happened.
  var sendOutcomeListeners = [];
  var sendRequestsInFlight = 0;

  function onSendOutcome(listener) {
    sendOutcomeListeners.push(listener);
    return function () {
      var index = sendOutcomeListeners.indexOf(listener);
      if (index > -1) sendOutcomeListeners.splice(index, 1);
    };
  }

  function emitSendOutcome(outcome) {
    sendOutcomeListeners.slice().forEach(function (listener) {
      listener(outcome);
    });
  }

  // B2C's own technical text ("AADB2C90027: ...") is not something to show an ECP. Dropping it
  // here lets showSendFailure fall back to GENERIC_SEND_ERROR instead.
  function usableMessage(text) {
    var trimmed = (text || '').trim();
    if (!trimmed || /AADB2C\d+/i.test(trimmed)) return '';
    return trimmed;
  }

  // Matched on the three tokens rather than a fixed path so it survives either URL shape B2C
  // uses (control and action in the path, or as query parameters) and so it holds for both the
  // AadSspr and CustomOtp control ids. Requiring the email control keeps the phone control's own
  // SendCode - clicked by handlePhoneVerificationSkip on the pages that carry both - out of the
  // email outcome.
  function isEmailSendCodeUrl(url) {
    var value = String(url || '');
    return /DisplayControlAction/i.test(value) && /SendCode/i.test(value) && /emailVerificationControl/i.test(value);
  }

  // The send only succeeded if B2C's own envelope says 200 as well as the transport: a
  // self-asserted display control action answers HTTP 200 even when the action failed, and
  // `message` is then the userMessage B2C forwarded from the backend's 409.
  function readSendOutcome(xhr) {
    var body = null;
    try {
      body = JSON.parse(xhr.responseText);
    } catch (e) {}

    var reportedStatus = body && body.status ? String(body.status) : String(xhr.status);
    if (xhr.status === 200 && reportedStatus === '200') {
      return { status: 'sent' };
    }

    return { status: 'error', message: usableMessage(body && (body.message || body.userMessage)) };
  }

  function installSendCodeInterceptor() {
    var XHR = window.XMLHttpRequest;
    if (!XHR || !XHR.prototype || XHR.prototype.opalSendCodeHooked) return;
    XHR.prototype.opalSendCodeHooked = true;

    var originalOpen = XHR.prototype.open;
    var originalSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      this.opalIsSendCode = isEmailSendCodeUrl(url);
      return originalOpen.apply(this, arguments);
    };

    XHR.prototype.send = function () {
      if (!this.opalIsSendCode) return originalSend.apply(this, arguments);

      var xhr = this;
      var settled = false;
      sendRequestsInFlight++;

      function settle(outcome) {
        if (settled) return;
        settled = true;
        sendRequestsInFlight = Math.max(0, sendRequestsInFlight - 1);
        emitSendOutcome(outcome);
      }

      xhr.addEventListener('load', function () {
        settle(readSendOutcome(xhr));
      });
      ['error', 'timeout', 'abort'].forEach(function (event) {
        xhr.addEventListener(event, function () {
          settle({ status: 'error', message: '' });
        });
      });

      return originalSend.apply(this, arguments);
    };
  }

  installSendCodeInterceptor();

  function codeFieldVisible() {
    return $('.verificationCode_li').is(':visible');
  }

  // The message B2C rendered for a failed send - the control's own error slot first, then the
  // page-level error. Non-empty means the send did not return 200.
  function sendErrorText() {
    var $controlError = $(EMAIL.errorMessage);
    if ($controlError.length && $controlError.is(':visible')) {
      var text = ($controlError.text() || '').trim();
      if (text) return text;
    }

    var $pageError = $('#claimVerificationServerError');
    if ($pageError.length && $pageError.is(':visible')) {
      var pageText = ($pageError.text() || '').trim();
      if (pageText) return pageText;
    }

    return '';
  }

  // Resolves once the SendCode request has actually landed, so the "code sent" confirmation and
  // the resend cooldown are never shown for a send that failed. The intercepted response is the
  // authoritative signal; the DOM watchers stay as a fallback for a request we never saw.
  //   - first send: B2C reveals the code field only on a 200, so that is the success signal.
  //   - resend:     the code field is already visible, so the only positive signal is the success
  //                 message being re-rendered; absence of an error within the grace window is the
  //                 fallback.
  function waitForSendOutcome(options) {
    var isResend = !!(options && options.isResend);
    var previousSuccessText = ($(EMAIL.successMessage).text() || '').trim();

    return new Promise(function (resolve) {
      var settled = false;
      var observer = null;
      var poll = null;
      var graceTimer = null;
      var timeoutTimer = null;
      var unsubscribe = onSendOutcome(function (outcome) {
        settle(outcome);
      });

      function settle(outcome) {
        if (settled) return;
        settled = true;
        unsubscribe();
        if (observer) observer.disconnect();
        clearInterval(poll);
        clearTimeout(graceTimer);
        clearTimeout(timeoutTimer);
        resolve(outcome);
      }

      function check() {
        var error = sendErrorText();
        if (error) {
          settle({ status: 'error', message: usableMessage(error) });
          return;
        }

        if (!isResend) {
          if (codeFieldVisible()) settle({ status: 'sent' });
          return;
        }

        var $success = $(EMAIL.successMessage);
        var successText = ($success.text() || '').trim();
        if ($success.is(':visible') && successText && successText !== previousSuccessText) {
          settle({ status: 'sent' });
        }
      }

      observer = new MutationObserver(check);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'aria-hidden'],
      });
      // The observer misses message updates that only replace text nodes, so poll as a backstop.
      poll = setInterval(check, 200);

      if (isResend) {
        // Never let the grace window call a send successful while its request is still open -
        // that is exactly the false "code sent" this guards against. The interceptor settles
        // those; the window only covers a send it never saw.
        var armGraceTimer = function () {
          graceTimer = setTimeout(function () {
            if (sendRequestsInFlight > 0) {
              armGraceTimer();
              return;
            }
            if (!sendErrorText()) settle({ status: 'sent' });
          }, SEND_ERROR_GRACE_MS);
        };
        armGraceTimer();
      }

      timeoutTimer = setTimeout(function () {
        var error = sendErrorText();
        if (error) {
          settle({ status: 'error', message: usableMessage(error) });
        } else if (codeFieldVisible() && !isResend) {
          settle({ status: 'sent' });
        } else {
          settle({ status: 'error', message: '' });
        }
      }, SEND_TIMEOUT_MS);

      check();
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

  // A cooldown only earns its keep once a code is actually on its way. After a rejected send
  // there is no code to wait for, so the countdown is torn down (including the stored deadline,
  // or it would be restored on the next render) and the resend control goes back to being
  // usable immediately.
  function clearResendCooldown() {
    if (resendCountdownInterval) {
      clearInterval(resendCountdownInterval);
      resendCountdownInterval = null;
    }
    try {
      sessionStorage.removeItem(RESEND_COOLDOWN_KEY);
    } catch (e) {}
    $('#otp-sent-at').remove();
    applyResendCooldownUi(false);
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

  // In-flight state: no countdown, since the send may still fail, but not clickable either, so a
  // double click cannot fire a second send while the first is open.
  function markSendPending(isResend) {
    var $btn = isResend ? otpControl('_but_send_new_code') : otpControl('_but_send_code');
    $btn.css({ 'pointer-events': 'none', opacity: '0.6' });
  }

  function releaseSendButtons() {
    $(EMAIL.sendCode).css({ 'pointer-events': '', opacity: '' });
    $(EMAIL.sendNewCode).css({ 'pointer-events': '', opacity: '' });
  }

  var OTP_GUIDANCE_HTML =
    '<div id="otp-guidance" role="note">' +
    '<p>Not seeing it? Check spam or junk. It can take a few minutes, ' +
    'and only one code is sent at a time.</p>' +
    '</div>';

  function showOtpGuidance() {
    var apiEl = document.getElementById('api');
    var flow = apiEl && apiEl.dataset.flow;
    if (['signin', 'signup', 'passwordless'].indexOf(flow) === -1) return;

    otpControl('_success_message').attr('role', 'status');

    if (!$('#otp-guidance').length) {
      $('.verificationCode_li').after(OTP_GUIDANCE_HTML);
    }

    if (!showOtpGuidance.fired) {
      showOtpGuidance.fired = true;
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(['event', 'otp_guidance_shown', { feature_id: 'otp1_wait_guidance', flow: flow }]);
    }
  }

  // B2C writes its own text into the same error slot a beat after the request settles, which
  // would replace the message we just put there. Hold ours for a short window so that is what
  // the user actually reads.
  function pinErrorMessage($error, text) {
    if (!$error.get(0)) return;

    clearErrorPin();
    $error.text(text).show();

    var deadline = Date.now() + ERROR_PIN_MS;
    errorPinInterval = setInterval(function () {
      if (Date.now() > deadline) {
        clearErrorPin();
        return;
      }
      if (($error.text() || '').trim() !== text) $error.text(text);
      if (!$error.is(':visible')) $error.show();
    }, 100);
  }

  function clearErrorPin() {
    if (errorPinInterval) {
      clearInterval(errorPinInterval);
      errorPinInterval = null;
    }
  }

  function showSendFailure(message) {
    clearResendCooldown();
    otpControl('_success_message').hide();
    $('#loading-indicator').remove();
    $('#api').show();

    if (!codeFieldVisible()) {
      // The initial "Send code" button sits inside the email row, which the auto-send path
      // hides. Bring it back or there is nothing left to retry with.
      $('.email_li').removeClass('none');
      $('.intro').removeClass('none');
    }

    var $error = $(EMAIL.errorMessage);
    if ($error.length) {
      // Normally message is the Opal service's own userMessage, forwarded by B2C from the 409.
      // It is empty only when the failure carried nothing readable - a transport error, or a
      // B2C-level fault whose AADB2C text usableMessage discards - so our copy stands in.
      pinErrorMessage($error, message || GENERIC_SEND_ERROR);
    }

    releaseSendButtons();
  }

  // Moves the page to the code-entry step. Deliberately says nothing about a code having been
  // sent - that is confirmCodeSent's job, and only once the send has been accepted.
  function revealCodeStep() {
    $('#api').show();
    $('#api h1').text('Enter verification code');
    $('.email_li').addClass('none');
    $('.intro').addClass('none');
    showOtpGuidance();
    attachResendGuard();
    resumeResendCooldownIfActive();
    watchForEmailVerified();
  }

  function confirmCodeSent(sentAt) {
    showSendConfirmation(sentAt);
    startResendCooldown(sentAt);
  }

  // Suppresses the previous outcome and puts the send button into its in-flight state, then waits
  // for the send to be accepted before anything on screen says a code went out.
  function beginSend(options) {
    var isResend = !!(options && options.isResend) || codeFieldVisible();
    var sendTriggeredAt = new Date();

    clearErrorPin();
    otpControl('_success_message').hide();
    $('#otp-sent-at').remove();
    $(EMAIL.errorMessage).hide().text('');
    markSendPending(isResend);

    waitForSendOutcome({ isResend: isResend }).then(function (outcome) {
      if (outcome.status === 'sent') {
        releaseSendButtons();
        revealCodeStep();
        confirmCodeSent(sendTriggeredAt);
        trackResend('accepted');

        if ($('.reenterPassword_li').length && $('.newPassword_li').length) {
          $('#continue').hide();
        }
        return;
      }

      showSendFailure(outcome.message);
      trackResend('send_failed');
    });
  }

  // Entry point for pages that load already on the code-entry step: a code went out on a prior
  // request that did return 200, so the confirmation and cooldown are correct here.
  function showVerificationCodeStep() {
    revealCodeStep();
    otpControl('_success_message').show();
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

    otpControl('_success_message').hide();
    $('#otp-sent-at').remove();
    $('.emailVerificationCode_li').addClass('none');
    $(EMAIL.control).addClass('none');
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

    var initialSuccessText = otpControl('_success_message').text().trim();
    var sawVerifyButton = false;
    var confirming = false;

    function verifyButtonVisible() {
      var btn = document.querySelector(EMAIL.verifyCode);
      return !!btn && btn.style.display !== 'none' && $(btn).is(':visible');
    }

    function errorVisible() {
      var err = document.querySelector(EMAIL.errorMessage);
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

        var currentText = otpControl('_success_message').text().trim();
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
        $(PHONE.sendCode).click();
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

  waitForElement(PHONE.sendCode).then(function () {
    var emailControl = document.querySelector(EMAIL.control);
    var emailVisible = emailControl && $(emailControl).is(':visible');
    if (!emailVisible) {
      handlePhoneVerificationSkip();
    }
  });

  // Every send - the automatic first one included - goes through beginSend, so the confirmation
  // and the cooldown wait for the send to be accepted rather than for the click.
  $(document).on('click', EMAIL.sendCode, function () {
    beginSend({ isResend: false });
  });

  $(document).on('click', EMAIL.sendNewCode, function () {
    beginSend({ isResend: true });
  });

  $(document).on('click', EMAIL.verifyCode, function () {
    watchForEmailVerified();
  });

  waitForButtonEnabled('continue').then((button) => {
    if (document.querySelector(PHONE.control) && !document.querySelector(EMAIL.control)) {
      return;
    }

    var sendCodeEl = document.querySelector(EMAIL.sendCode);
    var verifyCodeLi = document.querySelector('.verificationCode_li');
    if (verifyCodeLi && verifyCodeLi.style.display !== 'none' && sendCodeEl && sendCodeEl.style.display === 'none') {
      return;
    }

    var rePassword = $('.reenterPassword_li');
    var newPassword = $('.newPassword_li');

    if (rePassword.length && newPassword.length) {
      var emailControl = document.querySelector(EMAIL.control);
      if (emailControl && !emailVerificationConfirmed) {
        return;
      }
      otpControl('_success_message').hide();
      $('.emailVerificationCode_li').addClass('none');
      $(EMAIL.control).addClass('none');
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

  waitForElementVisible(EMAIL.sendCode).then(() => {
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
        $(EMAIL.sendCode).click();
      }, 500);
    }
  });

  waitForElement(EMAIL.control).then(function () {
    var sendCodeEl = document.querySelector(EMAIL.sendCode);
    var verifyCodeLi = document.querySelector('.verificationCode_li');
    var sendCodeHidden = sendCodeEl && sendCodeEl.style.display === 'none';
    var verifyCodeVisible = verifyCodeLi && verifyCodeLi.style.display !== 'none';

    if (verifyCodeVisible && sendCodeHidden) {
      showVerificationCodeStep();
    }
  });
});
