$(document).ready(function () {
    window.CONTENT.verifying_blurb = "";

    // A B2C display control id prefixes every DOM id that control renders, so these ids move
    // whenever a journey is repointed at a different control. Signup now renders
    // emailVerificationControlOpalOtp (SendCode -> REST-SendEmailOTP.Verify, i.e. the Opal/ACS
    // sender) where it used to render emailVerificationControl (AadSspr). Matching on the id
    // prefix rather than the exact id - the same approach verify-signin.js takes - keeps this
    // page working against either control, so reverting a journey needs no page change.
    //
    // The control's own root element is the only id with no underscore suffix; every child id the
    // control renders has one, hence the :not() rather than a bare prefix match.
    function control(suffix) {
        return suffix
            ? '[id^="emailVerificationControl"][id$="' + suffix + '"]'
            : '[id^="emailVerificationControl"]:not([id*="_"])';
    }

    const SELECTORS = {
        selfAsserted: '[data-name="SelfAsserted"]',
        sendCodeButton: control('_but_send_code'),
        verifyCodeButton: control('_but_verify_code'),
        verificationCodeField: '.verificationCode_li',
        emailField: '.email_li',
        introText: '.intro',
        changeClaimsButton: control('_but_change_claims'),
        verificationControl: control(''),
        verificationCodeLi: '.emailVerificationCode_li',
        verificationButtons: '#attributeVerification > .buttons',
        continueButton: 'continue',
        verifyingBlurb: '#verifying_blurb'
    };

    const selfAssertedElement = $(SELECTORS.selfAsserted);
    if (!selfAssertedElement.length) {
        return;
    }

    function waitForElementVisible(selector) {
        return new Promise(resolve => {
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
                attributeFilter: ['style', 'class']
            });
        });
    }


    function waitForButtonEnabled(buttonId) {
        return new Promise(resolve => {
            const button = document.getElementById(buttonId);

            if (button && button.getAttribute('aria-disabled') === 'false') {
                resolve(button);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const button = document.getElementById(buttonId);
                if (button && button.getAttribute('aria-disabled') === 'false') {
                    obs.disconnect();
                    resolve(button);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['aria-disabled']
            });
        });
    }

    $(SELECTORS.sendCodeButton).on('click', async function () {
        await waitForElementVisible(SELECTORS.verificationCodeField);

        const introMessage = window?.SA_FIELDS.AttributeFields[0]?.DISPLAY_CONTROL_CONTENT?.intro_msg
        if(introMessage) {
            $('#api h1').text(introMessage)
        }

        $(SELECTORS.emailField).addClass('none');
        $(SELECTORS.introText).addClass('none');
    });

    $(SELECTORS.verifyCodeButton).on('click', async function () {
        await waitForElementVisible(SELECTORS.changeClaimsButton);

        $(SELECTORS.verificationCodeLi).addClass('none');
        $(SELECTORS.verificationControl).addClass('none');
    });

    waitForButtonEnabled(SELECTORS.continueButton).then(button => {
        $(SELECTORS.verifyingBlurb).addClass('working');
        setTimeout(() => {
            button.click();
        }, 0);
    });

    waitForElementVisible(SELECTORS.sendCodeButton).then(() => {
        var emailVal = $('#email').val();
        if (!emailVal || !emailVal.length) {
            try {
                var stored = sessionStorage.getItem('b2c_collected_email');
                if (stored) {
                    var emailInput = document.getElementById('email');
                    var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    nativeSetter.call(emailInput, stored);
                    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                    emailInput.dispatchEvent(new Event('change', { bubbles: true }));
                    emailVal = stored;
                    sessionStorage.removeItem('b2c_collected_email');
                }
            } catch(ex) {}
        }
        if (emailVal && emailVal.length) {
            $(SELECTORS.emailField).addClass('none');
            $(SELECTORS.introText).addClass('none');
            setTimeout(function () {
                $(SELECTORS.sendCodeButton).click();
            }, 500);
        }
    });
});
