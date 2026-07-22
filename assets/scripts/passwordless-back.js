// verifyMFAEmailPasswordless only.
// When passwordless email OTP reaches the "The code has been verified. You can now
// continue." state — which, for an account without a passwordless credential, also
// shows "A user with the specified credential could not be found." — B2C's primary
// action is the "Change" button (#emailVerificationControl_but_change_claims).
// Repurpose that button as a "Back" button that returns to the previous screen
// (window.history.back()), matching the top back link.
(function () {
  var CHANGE_BTN_ID = 'emailVerificationControl_but_change_claims';

  function repurpose() {
    var btn = document.getElementById(CHANGE_BTN_ID);
    if (!btn) return false;
    if (btn.getAttribute('data-back-bound') === 'true') return true;

    // Replace the node to strip B2C's own click handler, keeping the same id so
    // B2C's show/hide styling still targets it.
    var back = btn.cloneNode(true);
    back.textContent = 'Back';
    back.setAttribute('data-back-bound', 'true');
    btn.parentNode.replaceChild(back, btn);

    back.addEventListener('click', function (e) {
      e.preventDefault();
      window.history.back();
    });
    return true;
  }

  function init() {
    if (repurpose()) return;
    var observer = new MutationObserver(function () {
      if (repurpose()) observer.disconnect();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
