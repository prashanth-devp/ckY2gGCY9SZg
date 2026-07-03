(function () {
  // Auto-skip the "choose Email or SMS" step on the forgot-password reset
  // journey. The user reached this page by entering their EMAIL on the sign-in
  // screen (signin_v2.js stashes it into b2c_collected_email on the "Forgot
  // password?" click), so asking them to pick a verification method again is
  // redundant — default to Email and continue. verify-forgot.js then consumes
  // the same key to pre-fill the address and auto-send the code.
  //
  // This lives in its own file (loaded only by selectMFAMethodForgotPassword.html)
  // rather than in the shared selectMFAMethodPasswordless.js, which also backs the
  // sign-in / MFA-setup / passwordless method-selection screens.
  var KEY = 'b2c_collected_email';
  var carried;
  try { carried = sessionStorage.getItem(KEY); } catch (e) { return; }
  // No carried email means we didn't arrive from the email path — leave the
  // screen alone so the user can choose (e.g. an account with only a phone).
  if (!carried) return;

  function apiEl() { return document.getElementById('api'); }
  function hideApi() { var a = apiEl(); if (a) a.style.visibility = 'hidden'; }
  function revealApi() { var a = apiEl(); if (a) a.style.visibility = ''; }

  // Find the radio for the Email option. Match on the input value or its label
  // text so we don't depend on the exact claim enum value from the policy.
  function findEmailRadio(radios) {
    for (var i = 0; i < radios.length; i++) {
      var r = radios[i];
      var labelText = '';
      if (r.id) {
        var lbl = document.querySelector('label[for="' + r.id + '"]');
        if (lbl) labelText = lbl.textContent || '';
      }
      var hay = ((r.value || '') + ' ' + labelText).toLowerCase();
      if (hay.indexOf('email') > -1 || hay.indexOf('e-mail') > -1) return r;
    }
    return null;
  }

  var tries = 0;
  var MAX_TRIES = 100; // ~10s at 100ms
  var timer = setInterval(function () {
    tries++;

    var radios = document.querySelectorAll('#api input[type="radio"]');
    var continueBtn = document.getElementById('continue');

    if (!radios.length || !continueBtn) {
      if (tries >= MAX_TRIES) { clearInterval(timer); revealApi(); }
      return;
    }

    var emailRadio = findEmailRadio(radios);
    if (!emailRadio) {
      // No Email option offered — let the user pick whatever is available.
      clearInterval(timer);
      revealApi();
      return;
    }

    clearInterval(timer);
    // Hide (not display:none, so clicks still register) to avoid flashing the
    // radio list before we advance.
    hideApi();
    emailRadio.click(); // checks the radio and fires change/click handlers
    setTimeout(function () { continueBtn.click(); }, 100);

    // Safety net: if we don't navigate away (validation/server error keeps us
    // on this page), bring the screen back so the user isn't stuck on a blank
    // card.
    setTimeout(revealApi, 5000);
  }, 100);
})();
