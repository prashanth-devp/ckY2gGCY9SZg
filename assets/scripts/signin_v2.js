const config = {
  maxAttempts: 30,
  checkInterval: 10, // ms
  // defaultHeading: "WELCOME BACK!",
  separatorText: "Don't have an account?",
};

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
  } catch (error) {
    console.warn(error.message);
    if (document.querySelector('#api[data-name="SelfAsserted"]')) {
      document.getElementById('api').style.display = '';
    }
  }
}

reorganizeLoginPage();
