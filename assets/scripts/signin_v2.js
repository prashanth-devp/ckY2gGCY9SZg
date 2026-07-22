const config = {
  maxAttempts: 30,
  checkInterval: 10, // ms
  // defaultHeading: "WELCOME BACK!",
  separatorText: "Don't have an account?",
};

// --- Identifier-first helpers --------------------------------------------
// The combined sign-in page renders the email+password form AND the
// PhoneSignInExchange (phone OTP) button together. We hide the password up
// front and show a single "email or phone" field (like the sign-up
// collectIdentifier screen). On Continue we branch: phone numbers are routed
// to the existing phone-OTP sub-journey via PhoneSignInExchange, while emails
// reveal the password field and keep the normal combined (password) sign-in.
function isPhoneInput(value) {
  return value.length > 0 && !value.includes('@') && /\d/.test(value) && !/[a-zA-Z]/.test(value);
}

function isValidPhone(value) {
  var digits = value.replace(/\D/g, '');
  if (digits.indexOf('1') === 0) {
    digits = digits.slice(1);
  }
  return digits.length === 10;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Normalize whatever the user typed into clean E.164 (+1XXXXXXXXXX), dropping
// a leading country-code "1" so the phone-collect page can pre-fill it.
function toE164(value) {
  var digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.indexOf('1') === 0) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);
  return digits.length === 10 ? '+1' + digits : '';
}

// Render national digits as the display format "+1 123 456 7890", building the
// string up incrementally so partial input formats cleanly while typing.
function formatPhoneDisplay(national) {
  var out = '+1';
  if (national.length > 0) out += ' ' + national.slice(0, 3);
  if (national.length > 3) out += ' ' + national.slice(3, 6);
  if (national.length > 6) out += ' ' + national.slice(6, 10);
  return out;
}

// Extract the 10-digit national number from whatever is in the field, dropping a
// leading country-code "1" (NANP area codes never start with 1, so a leading 1
// is always the country code — including the one our own "+1" prefix re-adds).
function nationalDigits(value) {
  var digits = value.replace(/\D/g, '');
  if (digits.charAt(0) === '1') {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

// Key the phone-collect page (phone-number.js) reads to pre-fill + auto-advance,
// mirroring how verify-signin.js consumes b2c_collected_email.
const COLLECTED_PHONE_KEY = 'b2c_collected_phone';

// Key the phone OTP screen (prefill-phone-signin.js) writes a send-stage
// failure into before routing back here, so the message shows on the sign-in
// screen instead of stranding the user on the OTP page.
const COLLECTED_ERROR_KEY = 'b2c_signin_error';

function showIdentifierError(message) {
  $('#error').text(message).show();
}

function clearIdentifierError() {
  $('#error').text('').hide();
}

function addRequiredSign() {
  if (!window.SA_FIELDS || !window.SA_FIELDS.AttributeFields) return;
  window.SA_FIELDS.AttributeFields.forEach((block) => {
    if (block.ID === 'password') {
      const passwordField = $('[for="password"]');
      passwordField.text(passwordField.text() + '*');
      return;
    }

    if (block.ID === 'signInName') {
      const signInNameField = $('[for="signInName"]');
      signInNameField.text(signInNameField.text() + '*');
      return;
    }
  });
}

function waitForElements() {
  return new Promise((resolve, reject) => {
    function getElements() {
      return {
        forgotPassword: document.getElementById('ForgotPasswordExchange'),
        // US-1.3: PhoneSignInExchange routes to Sub.PhoneSignIn (phone-only primary auth).
        passwordlessExchange: document.getElementById('PhoneSignInExchange'),
        // "Send one time code": email OTP option (PasswordlessExchange) shown on the password
        // step for users who don't know their password. Captured here before reorganizeOptions
        // clears the options list, otherwise innerHTML='' would destroy it.
        emailOtpExchange: document.getElementById('PasswordlessExchange'),
        createAccount: document.getElementById('SignUpExchange'),
        form: document.getElementById('localAccountForm'),
        isLoginPage: document.querySelector('#api.signIn'),
        heading: document.querySelector('.heading h1'),
        divider: document.querySelector('.divider'),
        socialSection: document.querySelector('.claims-provider-list-buttons.social'),
        next: document.getElementById('next'),
      };
    }

    const requiredElements = ['forgotPassword', 'createAccount', 'form', 'isLoginPage', 'next'];

    const elements = getElements();
    const allElementsFound = requiredElements.every((key) => elements[key]);

    if (allElementsFound) {
      resolve(elements);
      return;
    }

    // Set a timeout for maximum waiting time
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Login page elements not found in time'));
    }, config.maxAttempts * config.checkInterval);

    // Use MutationObserver to watch for DOM changes
    const observer = new MutationObserver((mutations, obs) => {
      const elements = getElements();
      const allElementsFound = requiredElements.every((key) => elements[key]);

      if (allElementsFound) {
        clearTimeout(timeout);
        obs.disconnect();
        resolve(elements);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  });
}

function waitForElementDisplayBlock(selector) {
  return new Promise((resolve) => {
    const isDisplayBlock = () => {
      const el = document.querySelector(selector);
      return el && el.style.display === 'block';
    };

    if (isDisplayBlock()) {
      resolve();
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      if (isDisplayBlock()) {
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

function updateHeading(heading) {
  heading.innerHTML = window.CONTENT?.social_intro || config.defaultHeading;
}

function removeDivider(divider) {
  if (divider) {
    divider.remove();
  }
}

function styleAuthLinks(forgotPassword, createAccount) {
  forgotPassword.classList.add('link');
  createAccount.classList.add('link');
}

function moveSocialSection(form, socialSection) {
  form.parentNode.insertBefore(socialSection, form.nextSibling);
}

function reorganizeOptions(socialSection, createAccount, forgotPassword, passwordlessExchange, emailOtpExchange) {
  const options = socialSection.querySelector('.options');
  if (!options) return;

  options.innerHTML = '';

  const signUpContainer = document.createElement('div');
  signUpContainer.appendChild(createAccount);

  const separatorContainer = document.createElement('div');
  separatorContainer.className = 'separator';
  separatorContainer.innerHTML = `<hr />${config.separatorText}<hr />`;

  const forgotContainer = document.createElement('div');
  forgotContainer.appendChild(forgotPassword);

  if (passwordlessExchange) {
    passwordlessExchange.textContent = passwordlessExchange.textContent || 'Login with one time password';
    const passwordlessContainer = document.createElement('div');
    passwordlessContainer.appendChild(passwordlessExchange);
    options.appendChild(passwordlessContainer);
  }

  // Re-attach the email one-time-code option destroyed by the innerHTML reset above.
  // Hidden on the identifier step; revealPasswordStep() shows it on the password step
  // so a user who doesn't know their password can request a code instead.
  if (emailOtpExchange) {
    emailOtpExchange.textContent = 'Login with one time password';
    emailOtpExchange.classList.remove('link');
    emailOtpExchange.style.cssText =
      'display:block;width:100%;box-sizing:border-box;text-align:center;text-decoration:none;' +
      'padding:14px 16px;border:1px solid #2F7D92;border-radius:0;background:#fff;color:#2F7D92;' +
      'font-weight:600;cursor:pointer;';
    const emailOtpContainer = document.createElement('div');
    emailOtpContainer.id = 'emailOtpOption';
    emailOtpContainer.classList.add('none');
    emailOtpContainer.style.marginTop = '12px';
    emailOtpContainer.appendChild(emailOtpExchange);
    options.appendChild(emailOtpContainer);
  }

  options.appendChild(forgotContainer);
  options.appendChild(separatorContainer);
  options.appendChild(signUpContainer);
  options.style = 'display: block;';
}

function removeSocialIntro(socialSection) {
  const socialIntro = socialSection.querySelector('.intro');
  if (socialIntro) {
    socialIntro.remove();
  }
}

async function setupNextButtonHandler() {
  const nextButton = document.getElementById('next');
  const nextButtonText = nextButton.textContent.trim();

  nextButton.addEventListener('click', function () {
    const workingElements = document.querySelectorAll('.working');

    workingElements.forEach(async (element) => {
      if (element.style.display === 'block') {
        nextButton.textContent = '';

        const spinnerElement = document.createElement('p');
        spinnerElement.className = 'spinner';

        nextButton.appendChild(spinnerElement);

        await waitForElementDisplayBlock('.pageLevel');
        nextButton.textContent = nextButtonText;
        spinnerElement.remove();
      }
    });
  });
}

// Turn the combined sign-in page into an identifier-first flow.
//   Step 1: only the identifier field ("Email or phone number") + Continue.
//   Step 2: phone -> route to the phone-OTP sub-journey (PhoneSignInExchange);
//           email -> reveal password + the real Login button on this page.
function setupIdentifierFirst(elements) {
  const signInName = document.getElementById('signInName');
  const password = document.getElementById('password');
  const next = elements.next; // real ADB2C submit button
  const phoneExchange = elements.passwordlessExchange; // #PhoneSignInExchange

  if (!signInName || !password || !next) return;

  // "Forgot password?" only makes sense once we ask for a password, so it stays
  // hidden on the identifier step and is revealed with the password field.
  const forgotPassword = elements.forgotPassword;
  const forgotContainer = forgotPassword ? forgotPassword.parentNode : null;
  function setForgotHidden(hidden) {
    const target = forgotContainer || forgotPassword;
    if (target) target.classList[hidden ? 'add' : 'remove']('none');
  }

  // Carry the email the user just typed into the forgot-password sub-journey so
  // the "verify email" reset screen can pre-fill it instead of asking again
  // (verify-forgot.js consumes b2c_collected_email, same key as verify-signin.js).
  // "Forgot password?" is only reachable from the email/password step, so the
  // identifier here is always an email, not a phone number.
  if (forgotPassword) {
    forgotPassword.addEventListener('click', function () {
      const value = signInName.value.trim();
      if (isValidEmail(value)) {
        try { sessionStorage.setItem('b2c_collected_email', value); } catch (e) {}
      }
    });
  }

  // "Login with one time password" (email OTP) — shown on the identifier step as an
  // alternative to entering a password; hidden once the user commits to the password step.
  // Stash the typed email so the OTP screen prefills it (same key verify-signin.js consumes).
  const emailOtpExchange = elements.emailOtpExchange;
  function setEmailOtpHidden(hidden) {
    const container = document.getElementById('emailOtpOption');
    const target = container || emailOtpExchange;
    if (target) target.classList[hidden ? 'add' : 'remove']('none');
  }
  if (emailOtpExchange) {
    emailOtpExchange.addEventListener('click', function () {
      const value = signInName.value.trim();
      if (isValidEmail(value)) {
        try { sessionStorage.setItem('b2c_collected_email', value); } catch (e) {}
      }
    });
  }

  // Prefer the dedicated .entry-item wrapper; never fall back to a parent that
  // could be the whole form (that would hide the identifier field too).
  const passwordItem = password.closest('.entry-item');
  const passwordLabel = document.querySelector('.password-label') || document.querySelector('[for="password"]');

  function setPasswordHidden(hidden) {
    const action = hidden ? 'add' : 'remove';
    if (passwordItem) {
      passwordItem.classList[action]('none');
    } else {
      password.classList[action]('none');
      if (passwordLabel) passwordLabel.classList[action]('none');
    }
  }

  // Relabel the identifier field so it accepts email OR phone.
  const signInLabel = document.querySelector('[for="signInName"]');
  if (signInLabel) signInLabel.textContent = 'Your email or phone number*';
  signInName.setAttribute('placeholder', 'Your email or phone number');

  // Surface validation errors ABOVE the identifier label/field rather than at
  // the bottom of the card. #error lives outside #api by default; insertBefore
  // moves it in front of the anchor (works across parents). Anchor on the
  // field's .entry-item so the error sits above the "Your email or phone
  // number*" label, falling back to the label or the input itself.
  const errorEl = document.getElementById('error');
  const errorAnchor = signInName.closest('.entry-item') || signInLabel || signInName;
  if (errorEl && errorAnchor && errorAnchor.parentNode) {
    errorEl.style.marginBottom = '0.5rem';
    errorEl.style.marginTop = '0';
    errorAnchor.parentNode.insertBefore(errorEl, errorAnchor);
  }

  // Live-format the value as "+1 123 456 7890" while typing, but only when the
  // input looks like a phone number. As soon as it contains a letter or "@" we
  // leave it untouched so email entry keeps working.
  signInName.addEventListener('input', function () {
    const value = signInName.value;
    if (!value || /[a-zA-Z@]/.test(value)) return;
    const national = nationalDigits(value);
    if (!national) return; // nothing to format yet — allow clearing / switching to email
    signInName.value = formatPhoneDisplay(national);
  });

  function revealPasswordStep() {
    setPasswordHidden(false);
    setForgotHidden(false);
    setEmailOtpHidden(true);
    next.classList.remove('none');
    if (continueBtn) continueBtn.classList.add('none');
    if (phoneExchange) phoneExchange.classList.add('none');
    password.focus();
  }

  // If ADB2C re-rendered the page after a failed sign-in it preserves the
  // entered username (or a login_hint pre-fills it). Skip straight to the
  // password step in that case so the user isn't bounced back to step 1.
  // A send-stage failure on the phone OTP screen routes the user back here with
  // the message stashed in sessionStorage (see prefill-phone-signin.js).
  let carriedSignInError = '';
  try {
    carriedSignInError = sessionStorage.getItem(COLLECTED_ERROR_KEY) || '';
    if (carriedSignInError) sessionStorage.removeItem(COLLECTED_ERROR_KEY);
  } catch (e) {}

  const hasPrefilledIdentifier = signInName.value && signInName.value.trim().length > 0;
  const hasPageError = $('.pageLevel .error').filter(':visible').length > 0;
  // When we came back carrying a phone send-error, keep the user on the
  // identifier step (they arrived via phone, not password) and show it there.
  const startOnPasswordStep = !carriedSignInError && (hasPrefilledIdentifier || hasPageError);

  // Build the Continue button (inherits the #api button styling).
  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.id = 'identifierContinue';
  continueBtn.textContent = 'Continue';
  next.parentNode.insertBefore(continueBtn, next);

  if (startOnPasswordStep) {
    revealPasswordStep();
  } else {
    // Step 1 state: hide password + real Login button, hide "Forgot password?"
    // (only relevant with a password), hide the redundant "Login with one time
    // password" option (phone is auto-routed on Continue).
    setPasswordHidden(true);
    setForgotHidden(true);
    setEmailOtpHidden(false);
    next.classList.add('none');
    if (phoneExchange) phoneExchange.classList.add('none');
  }

  if (carriedSignInError) {
    // Re-format a carried-back phone number for display on the identifier step.
    if (signInName.value && !/[a-zA-Z@]/.test(signInName.value)) {
      const national = nationalDigits(signInName.value);
      if (national) signInName.value = formatPhoneDisplay(national);
    }
    showIdentifierError(carriedSignInError);
  }

  continueBtn.addEventListener('click', function () {
    clearIdentifierError();
    const value = signInName.value.trim();

    if (!value) {
      showIdentifierError('Please enter an email address or phone number.');
      return;
    }

    if (isPhoneInput(value)) {
      if (!isValidPhone(value)) {
        showIdentifierError('Please enter a valid 10-digit phone number.');
        return;
      }
      if (!phoneExchange) {
        showIdentifierError('Phone sign-in is unavailable. Please sign in with your email.');
        return;
      }
      // Carry the number to the phone-collect page so it isn't asked again.
      try {
        sessionStorage.setItem(COLLECTED_PHONE_KEY, toE164(value));
      } catch (e) {}
      // Hand off to the phone-OTP sub-journey (collects phone + sends code).
      // Keep the exchange button hidden — a programmatic .click() fires its
      // handler even while display:none, so revealing it would only flash the
      // "Sign in with phone" label on screen during the navigation gap.
      phoneExchange.click();
      return;
    }

    if (!isValidEmail(value)) {
      showIdentifierError('Please enter a valid email address.');
      return;
    }

    revealPasswordStep();
  });

  // Pressing Enter in the identifier field triggers implicit form submission, which
  // clicks the native submit (#next) even while it's hidden — signing in with no
  // password and skipping our email/phone routing. On the identifier step route Enter
  // to the custom Continue instead. On the password step continueBtn is hidden, so we
  // let the native Enter -> #next submission through (that's the real sign-in).
  signInName.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (continueBtn.classList.contains('none')) return;
    e.preventDefault();
    continueBtn.click();
  });
}

async function reorganizeLoginPage() {
  try {
    const elements = await waitForElements();
    addRequiredSign();
    removeDivider(elements.divider);
    styleAuthLinks(elements.forgotPassword, elements.createAccount);
    moveSocialSection(elements.form, elements.socialSection);
    reorganizeOptions(
      elements.socialSection,
      elements.createAccount,
      elements.forgotPassword,
      elements.passwordlessExchange,
      elements.emailOtpExchange,
    );
    removeSocialIntro(elements.socialSection);
    setupNextButtonHandler();
    setupIdentifierFirst(elements);
  } catch (error) {
    console.warn(error.message);
    if (document.querySelector('#api[data-name="SelfAsserted"]')) {
      document.getElementById('api').style.display = '';
    }
  }
}

reorganizeLoginPage();
