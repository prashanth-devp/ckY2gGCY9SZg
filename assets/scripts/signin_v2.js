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

function reorganizeOptions(socialSection, createAccount, forgotPassword, passwordlessExchange) {
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
  if (signInLabel) signInLabel.textContent = 'Email or phone number';
  signInName.setAttribute('placeholder', 'Email or phone number');

  function revealPasswordStep() {
    setPasswordHidden(false);
    next.classList.remove('none');
    if (continueBtn) continueBtn.classList.add('none');
    if (phoneExchange) phoneExchange.classList.add('none');
    password.focus();
  }

  // If ADB2C re-rendered the page after a failed sign-in it preserves the
  // entered username (or a login_hint pre-fills it). Skip straight to the
  // password step in that case so the user isn't bounced back to step 1.
  const hasPrefilledIdentifier = signInName.value && signInName.value.trim().length > 0;
  const hasPageError = $('.pageLevel .error').filter(':visible').length > 0;
  const startOnPasswordStep = hasPrefilledIdentifier || hasPageError;

  // Build the Continue button (inherits the #api button styling).
  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.id = 'identifierContinue';
  continueBtn.textContent = 'Continue';
  next.parentNode.insertBefore(continueBtn, next);

  if (startOnPasswordStep) {
    revealPasswordStep();
  } else {
    // Step 1 state: hide password + real Login button, hide the redundant
    // "Login with one time password" option (phone is auto-routed on Continue).
    setPasswordHidden(true);
    next.classList.add('none');
    if (phoneExchange) phoneExchange.classList.add('none');
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
      // Hand off to the phone-OTP sub-journey (collects phone + sends code).
      phoneExchange.classList.remove('none');
      phoneExchange.click();
      return;
    }

    if (!isValidEmail(value)) {
      showIdentifierError('Please enter a valid email address.');
      return;
    }

    revealPasswordStep();
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
