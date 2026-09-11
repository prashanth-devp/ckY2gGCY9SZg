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

    function isolatedDigitRuns(text) {
      var segments = text.match(/\d+|\D+/g) || [];
      return segments.filter(function (segment) {
        return /^\d+$/.test(segment);
      });
    }

    function sanitizeOtpValue(input) {
      var raw = input.value;
      var withoutInvisible = raw.replace(/[\u00A0\u200B-\u200D\uFEFF]/g, '');
      var runs = isolatedDigitRuns(withoutInvisible);
      var cleaned;

      if (runs.length === 1) {
        cleaned = runs[0].slice(0, 6);
      } else {
        var sixDigitRuns = runs.filter(function (run) {
          return run.length === 6;
        });
        // Repeats of the same code (e.g. "186118 186118") are not ambiguous - only distinct
        // values are. Dedupe before deciding whether there is exactly one candidate.
        var distinctSixDigitRuns = sixDigitRuns.filter(function (run, index) {
          return sixDigitRuns.indexOf(run) === index;
        });
        if (distinctSixDigitRuns.length === 1) {
          cleaned = distinctSixDigitRuns[0];
        } else {
          // Genuinely ambiguous - two or more different-looking numbers, no single clear
          // candidate. Still never allow more than six digits in the field either way.
          cleaned = withoutInvisible.replace(/\D/g, '').slice(0, 6);
        }
      }

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

    // Figma shows a visibility (eye) icon inside the code field. Purely decorative for now - no
    // masking/toggle behaviour wired up, so it doesn't affect the input's value, autocomplete, or
    // autofill. aria-hidden + pointer-events:none keep it out of the way of screen readers and
    // clicks, which just pass through to the input underneath.
    function addEyeIconToCodeInput($input) {
      var input = $input[0];
      if (!input || input.dataset.otpEyeIconAdded) return;
      input.dataset.otpEyeIconAdded = 'true';

      // Wrap just the input, not the whole field group (label + error text sit above it in the
      // same .attrEntry) - otherwise centering the icon at 50% height centers it against that
      // taller block instead of the input box itself.
      $input.wrap('<span class="otp-code-input-wrap" style="position:relative;display:block;"></span>');
      $input.css('paddingRight', '36px');

      var eyeIconSvg =
        '<svg width="15" height="12" viewBox="0 0 15 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
        '<path d="M7.21244 0C10.8072 0 13.7978 2.58651 14.4248 6C13.7978 9.41347 10.8072 12 7.21244 12C3.61765 12 0.627007 9.41347 0 6C0.627007 2.58651 3.61765 0 7.21244 0ZM7.21244 10.6667C10.0362 10.6667 12.4524 8.70133 13.064 6C12.4524 3.29869 10.0362 1.33333 7.21244 1.33333C4.38864 1.33333 1.97239 3.29869 1.36076 6C1.97239 8.70133 4.38864 10.6667 7.21244 10.6667ZM7.21244 9C5.55556 9 4.21241 7.65687 4.21241 6C4.21241 4.34315 5.55556 3 7.21244 3C8.86924 3 10.2124 4.34315 10.2124 6C10.2124 7.65687 8.86924 9 7.21244 9ZM7.21244 7.66667C8.13291 7.66667 8.87911 6.92047 8.87911 6C8.87911 5.07953 8.13291 4.33333 7.21244 4.33333C6.29197 4.33333 5.54575 5.07953 5.54575 6C5.54575 6.92047 6.29197 7.66667 7.21244 7.66667Z" fill="#1A1A1A"/>' +
        '</svg>';

      $(eyeIconSvg)
        .css({
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        })
        .insertAfter($input);
    }

    function applyHardening() {
      var $codeInput = $('.verificationCode_li input');
      if ($codeInput.length) {
        hardenOtpInput($codeInput);
        addEyeIconToCodeInput($codeInput);
      }
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
