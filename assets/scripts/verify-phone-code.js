$(document).ready(function () {
  // Guarded: this is the first statement on the page, so a missing window.CONTENT used to throw
  // before a single handler was bound - leaving B2C's own control running unassisted, which is
  // one of the ways the verified card ends up with nothing but "Change" on it (bug 252397).
  if (window.CONTENT) {
    window.CONTENT.verifying_blurb = '';
  }

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

  // Resolves the button once B2C enables it, or null after timeoutMs. The timeout matters: if
  // this never resolves, the verify handler below stops half-way with the control already
  // hidden, which is how users ended up on a card they could not get off (bug 252397).
  function waitForButtonEnabled(buttonId, timeoutMs) {
    return new Promise((resolve) => {
      const isEnabled = (el) =>
        el && el.getAttribute('aria-disabled') !== 'true' && !el.disabled;

      if (isEnabled(document.getElementById(buttonId))) {
        resolve(document.getElementById(buttonId));
        return;
      }

      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        observer.disconnect();
        resolve(value);
      };

      const timer = setTimeout(() => done(null), timeoutMs || 10000);

      const observer = new MutationObserver(() => {
        const button = document.getElementById(buttonId);
        if (isEnabled(button)) done(button);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-disabled', 'disabled'],
      });
    });
  }

  // Submits the page. B2C's own continue button sits in a button row these pages keep hidden
  // (form#attributeVerification > .buttons), so it has to be revealed before the click.
  function submitContinue() {
    var continueBtn = document.getElementById('continue');
    if (!continueBtn) return false;

    $('#attributeVerification > .buttons').css('display', 'flex');
    continueBtn.click();
    return true;
  }

  // Bug 252397: once the code is verified B2C swaps the control over to a success message plus
  // its own "Change" button and hides everything else, so "Change" is the only button on screen.
  // It only resets the claim - and the phone row is hidden on every page that loads this script,
  // so it never had anything to change. Relabel it "Continue" and wire it to the real submit, so
  // the verified state always has a way forward even when the auto-advance below does not fire.
  function repurposeChangeClaimsToContinue() {
    var btn = document.getElementById('phoneVerificationControl_but_change_claims');
    if (!btn || btn.getAttribute('data-opal-continue') === 'true') return;

    // Replace the node to strip B2C's own reset handler, keeping the id so B2C's show/hide
    // styling still targets it.
    var proceed = btn.cloneNode(true);
    proceed.textContent = 'Continue';
    proceed.setAttribute('data-opal-continue', 'true');
    btn.parentNode.replaceChild(proceed, btn);

    proceed.addEventListener('click', function (e) {
      e.preventDefault();
      submitContinue();
    });
  }

  (function keepChangeClaimsRepurposed() {
    repurposeChangeClaimsToContinue();

    var observer = new MutationObserver(repurposeChangeClaimsToContinue);
    observer.observe(document.body, { childList: true, subtree: true });
  })();

  $(document).on('click', '#phoneVerificationControl_but_send_code', async function () {
    await waitForElementVisible('.verificationCode_li');

    $('#api').show();
    const introMessage =
      window.SA_FIELDS?.AttributeFields?.[0]?.DISPLAY_CONTROL_CONTENT?.intro_msg;
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

  // Deliberately no synchronous first read: this runs while B2C's verify request is still in
  // flight, so the DOM still holds the *previous* attempt's state. Reading it straight away is
  // what made a correct code entered after a wrong one resolve as 'error' (bug 252397) - the
  // handler then returned early and left the user on B2C's verified card with only "Change" on
  // it. Resolves 'timeout' rather than hanging if neither signal ever arrives.
  function waitForVerificationResult(timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;

      function done(value) {
        if (settled) return;
        settled = true;
        clearInterval(pollInterval);
        clearTimeout(timer);
        observer.disconnect();
        resolve(value);
      }

      function check() {
        var result = checkVerificationState();
        if (result) done(result);
      }

      var pollInterval = setInterval(check, 200);
      var timer = setTimeout(function () { done('timeout'); }, timeoutMs || 20000);

      var observer = new MutationObserver(check);
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

    // Drop the previous attempt's message so the poll below cannot mistake it for the result of
    // this one. Only the text is cleared - B2C owns the element's visibility and rewrites the
    // text on every response, so a genuine repeat error is still detected.
    var staleError = document.getElementById('phoneVerificationControl_error_message');
    if (staleError) {
      staleError.textContent = '';
    }

    var result = await waitForVerificationResult();

    // 'timeout' means neither signal ever showed. Leave B2C's markup alone in both cases: the
    // verified card carries the repurposed "Continue" button and an error card carries the code
    // row, so either way the user has something to act on.
    if (result !== 'success') {
      $('#phoneVerificationControl').removeClass('none');
      $('.verificationCode_li').removeClass('none');
      return;
    }

    $('#phoneVerificationControl_success_message').hide();
    $('.verificationCode_li').addClass('none');
    $('#phoneVerificationControl').addClass('none');
    $('.phone_li').addClass('none');

    var continueBtn = await waitForButtonEnabled('continue', 10000);

    // Continue never came good (or this page has none). Put the control back so the repurposed
    // "Continue" is reachable instead of leaving an empty card behind.
    if (!continueBtn) {
      $('#phoneVerificationControl').removeClass('none');
      return;
    }

    await new Promise(function (r) { setTimeout(r, 1000); });
    submitContinue();

    waitForElementVisible('#claimVerificationServerError').then(function () {
      var $err = $('#claimVerificationServerError');
      var errText = ($err.text() || '').toLowerCase();
      if (errText.indexOf('already exists') !== -1 || errText.indexOf('specified id') !== -1) {
        $err.text('An account already exists with this phone number.');
      }
      $('#api').show();
      $('#phoneVerificationControl').removeClass('none');
      $('.verificationCode_li').removeClass('none');
      $('.phone_li').removeClass('none');
    });
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
