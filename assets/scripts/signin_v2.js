const config = {
  maxAttempts: 30,
  checkInterval: 10, // ms
  // defaultHeading: "WELCOME BACK!",
  separatorText: "Don't have an account?",
};

function isPhoneValue(value) {
  var trimmed = value.trim();
  return trimmed.length > 0 && !trimmed.includes('@') && /\d/.test(trimmed);
}

function formatPhoneDisplay(raw) {
  var digits = raw.replace(/\D/g, '');
  if (digits.length > 10 && digits[0] === '1') digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + ' ' + digits.slice(3);
  return digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6);
}

function toE164(displayValue) {
  var digits = displayValue.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  return '+1' + digits.slice(0, 10);
}

function setupPhoneInput(input) {
  if (!input) return;

  input.placeholder = 'Enter email or phone number';

  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'display: flex; align-items: center; border-bottom: 1px solid #111827;';

  var prefix = document.createElement('span');
  prefix.id = 'phone-prefix';
  prefix.textContent = '+1';
  prefix.style.cssText = 'font-size: 0.875rem; color: #5a6a72; padding: 1rem 0.25rem 1rem 1rem; display: none; white-space: nowrap;';

  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(prefix);
  wrapper.appendChild(input);
  input.style.borderBottom = 'none';

  var storedE164 = '';

  input.addEventListener('input', function () {
    var val = this.value;
    if (isPhoneValue(val)) {
      prefix.style.display = '';
      var formatted = formatPhoneDisplay(val);
      storedE164 = toE164(val);
      if (this.value !== formatted) this.value = formatted;
      this.style.paddingLeft = '4px';
    } else {
      prefix.style.display = 'none';
      storedE164 = '';
      this.style.paddingLeft = '';
    }
  });

  var nextBtn = document.getElementById('next');
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      if (storedE164) {
        var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, storedE164);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, true);
  }
}

function repositionErrorDiv() {
  var apiEl = document.getElementById('api');
  var errorEl = document.getElementById('error');
  if (!apiEl || !errorEl) return;
  var firstEntry = apiEl.querySelector('.entry-item, .attrEntry');
  if (firstEntry) {
    apiEl.insertBefore(errorEl, firstEntry);
  }
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
        signInInput: document.getElementById('signInName') || document.getElementById('email'),
      };
    }

    const requiredElements = ['forgotPassword', 'form', 'isLoginPage', 'next'];

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
  if (createAccount) createAccount.classList.add('link');
}

function moveSocialSection(form, socialSection) {
  form.parentNode.insertBefore(socialSection, form.nextSibling);
}

function reorganizeOptions(socialSection, createAccount, forgotPassword, passwordlessExchange) {
  const options = socialSection.querySelector('.options');
  if (!options) return;

  options.innerHTML = '';

  const forgotContainer = document.createElement('div');
  forgotContainer.appendChild(forgotPassword);

  if (passwordlessExchange) {
    passwordlessExchange.textContent = passwordlessExchange.textContent || 'Login with one time password';
    const passwordlessContainer = document.createElement('div');
    passwordlessContainer.appendChild(passwordlessExchange);
    options.appendChild(passwordlessContainer);
  }

  options.appendChild(forgotContainer);

  if (createAccount) {
    const separatorContainer = document.createElement('div');
    separatorContainer.className = 'separator';
    separatorContainer.innerHTML = `<hr />${config.separatorText}<hr />`;

    const signUpContainer = document.createElement('div');
    signUpContainer.appendChild(createAccount);

    options.appendChild(separatorContainer);
    options.appendChild(signUpContainer);
  }

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
    setupPhoneInput(elements.signInInput);
    repositionErrorDiv();
  } catch (error) {
    console.warn(error.message);
    if (document.querySelector('#api[data-name="SelfAsserted"]')) {
      document.getElementById('api').style.display = '';
    }
  }
}

reorganizeLoginPage();
