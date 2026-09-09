function addRequiredSign() {
  if (!window.SA_FIELDS || !window.SA_FIELDS.AttributeFields) return;
  window.SA_FIELDS.AttributeFields.forEach((block) => {
    const fields = block?.DISPLAY_FIELDS || [block];
    fields.forEach((field) => {
      if (!field.IS_REQ) return;
      const fieldLabel = $(`#${field.ID}_label`);
      fieldLabel.text(fieldLabel.text() + '*');
    });
  });
}

function navigateToPasswordless() {
  // Reads the current B2C authorize URL and re-issues it with flow_hint=passwordless
  var url = new URL(window.location.href);
  url.searchParams.set('flow_hint', 'passwordless');
  window.location.href = url.toString();
}

function navigateToSignUp() {
  // Reads the current B2C authorize URL and re-issues it with flow_hint=sign_up
  var url = new URL(window.location.href);
  url.searchParams.set('flow_hint', 'sign_up');
  window.location.href = url.toString();
}

function navigateToSignIn() {
  // Reads the current B2C authorize URL and re-issues it WITHOUT flow_hint, which
  // restarts the journey at Sub.Login (the sign-in first screen). CTX-Init resets
  // all route claims to false on a fresh authorize, so this always lands on sign-in.
  var url = new URL(window.location.href);
  url.searchParams.delete('flow_hint');
  window.location.href = url.toString();
}

$(document).ready(function () {
  addRequiredSign();

  // Bind secondary button
  $('#btn-passwordless').on('click', function () {
    navigateToPasswordless();
  });

  // Bind sign up link
  $('#btn-signup').on('click', function (e) {
    e.preventDefault();
    navigateToSignUp();
  });

  // On a duplicate-identity error ("account already exists" for email or phone, in sign-up
  // or link/change), the server rejects the submit via #claimVerificationServerError.
  // Re-clicking "Continue to Opal" (#continue) would just re-submit and re-error, so hide it
  // while that error is shown and restore it once the error clears (e.g. the user edits the
  // email/phone). Runs on every page but only acts on the duplicate-identity message, and
  // never touches B2C's own disabled/aria-disabled state.
  (function guardContinueOnDuplicateIdentity() {
    var DUPLICATE_ERROR = /(already exists|specified id)/i;

    function duplicateErrorShown() {
      var $error = $('#claimVerificationServerError');
      if (!$error.length || !$error.is(':visible')) return false;
      return DUPLICATE_ERROR.test(($error.text() || '').trim());
    }

    function applyGuard() {
      var continueButton = document.getElementById('continue');
      if (!continueButton) return;

      if (duplicateErrorShown()) {
        if (continueButton.dataset.dupHidden !== 'true') {
          continueButton.dataset.dupHidden = 'true';
          continueButton.style.setProperty('display', 'none', 'important');
        }
      } else if (continueButton.dataset.dupHidden === 'true') {
        delete continueButton.dataset.dupHidden;
        continueButton.style.removeProperty('display');
      }
    }

    var observer = new MutationObserver(applyGuard);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden'],
    });

    applyGuard();
  })();

  (function hardenVerificationCodeInput() {
    function hardenOtpInput($input) {
      var input = $input[0];
      if (!input || input.dataset.otpHardened) return;
      input.dataset.otpHardened = 'true';
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('autocomplete', 'one-time-code');
      input.setAttribute('pattern', '[0-9]*');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('autocapitalize', 'off');
      input.addEventListener('input', function () {
        sanitizeOtpValue(input);
      });
    }

    function sanitizeOtpValue(input) {
      var raw = input.value;
      var cleaned = raw.replace(/[\s\u00A0\u200B-\u200D\uFEFF]/g, '').replace(/\D/g, '');
      if (cleaned === raw) return;
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, cleaned);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      trackOtpSanitised(raw.length - cleaned.length);
    }

    function trackOtpSanitised(removedChars) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push([
        'event',
        'otp_input_sanitised',
        { feature_id: 'otp1_paste_autofill', removed_chars: removedChars },
      ]);
    }

    function applyHardening() {
      var $codeInput = $('.verificationCode_li input');
      if ($codeInput.length) hardenOtpInput($codeInput);
    }

    var observer = new MutationObserver(applyHardening);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    applyHardening();
  })();
});
