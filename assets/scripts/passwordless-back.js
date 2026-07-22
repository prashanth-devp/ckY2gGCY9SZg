// verifyMFAEmailPasswordless only.
// When passwordless email OTP reaches the "The code has been verified. You can now
// continue." state — which, for an account without a passwordless credential, also
// shows "A user with the specified credential could not be found." — two tweaks:
//   1. Repurpose B2C's "Change" button (#emailVerificationControl_but_change_claims)
//      into a "Back" button that returns to the previous screen.
//   2. Remove the "The code has been verified. You can now continue." message.
// Both are scoped to this page so the shared verify-signin.js is unaffected elsewhere.
(function () {
  var CHANGE_BTN_ID = 'emailVerificationControl_but_change_claims';
  var SUCCESS_MSG_ID = 'emailVerificationControl_success_message';
  var VERIFIED_TEXT = 'The code has been verified';

  var buttonBound = false;

  function repurposeButton() {
    if (buttonBound) return;
    var btn = document.getElementById(CHANGE_BTN_ID);
    if (!btn) return;

    // Replace the node to strip B2C's own click handler, keeping the same id so
    // B2C's show/hide styling still targets it.
    var back = btn.cloneNode(true);
    back.textContent = 'Back';
    btn.parentNode.replaceChild(back, btn);
    back.addEventListener('click', function (e) {
      e.preventDefault();
      window.history.back();
    });
    buttonBound = true;
  }

  // Hide only the "verified, continue" message; leave the earlier "code sent"
  // message intact. Guard on display to avoid a mutation loop with the observer.
  function hideVerifiedMessage() {
    var msg = document.getElementById(SUCCESS_MSG_ID);
    if (msg && msg.style.display !== 'none' && msg.textContent.indexOf(VERIFIED_TEXT) !== -1) {
      msg.style.display = 'none';
    }
  }

  function tick() {
    repurposeButton();
    hideVerifiedMessage();
  }

  function init() {
    tick();
    var observer = new MutationObserver(tick);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden'],
      characterData: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
