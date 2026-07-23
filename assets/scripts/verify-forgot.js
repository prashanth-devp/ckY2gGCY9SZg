$(document).ready(function () {
    window.CONTENT.verifying_blurb = "";

    const isForgotPasswordPage = $('[data-name="SelfAsserted"]');

    if (!isForgotPasswordPage.length) {
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

    var resendTimerInterval = null;

    function startResendTimer() {
        if (resendTimerInterval) {
            clearInterval(resendTimerInterval);
        }

        var $btn = $('#emailVerificationControl_but_send_new_code');
        if (!$btn.length) {
            return;
        }

        var label = $btn.text().replace(/\s*\(\d+s\)$/, '').trim() || 'Resend code';
        var remaining = 60;

        $btn.text(label + ' (' + remaining + 's)');
        $btn.css({ 'pointer-events': 'none', opacity: '0.6' });

        resendTimerInterval = setInterval(function () {
            remaining--;
            if (remaining <= 0) {
                clearInterval(resendTimerInterval);
                resendTimerInterval = null;
                $btn.text(label);
                $btn.css({ 'pointer-events': '', opacity: '' });
            } else {
                $btn.text(label + ' (' + remaining + 's)');
            }
        }, 1000);
    }

    $('#emailVerificationControl_but_send_code').on('click', async function () {
        await waitForElementVisible('.verificationCode_li');

        const introMessage = window?.SA_FIELDS.AttributeFields[0]?.DISPLAY_CONTROL_CONTENT?.intro_msg
        if(introMessage) {
            $('#api h1').text(introMessage)
        }

        $('.email_li').addClass('none');
        $('.intro').addClass('none');
        startResendTimer();
    });

    $(document).on('click', '#emailVerificationControl_but_send_new_code', function () {
        startResendTimer();
    });

    // Pre-fill the email carried over from the sign-in screen (signin_v2.js
    // stashes it on "Forgot password?"), so the user isn't asked to re-type the
    // address they already entered. Mirrors verify-signin.js: fill #email, hide
    // the email row, and auto-send the verification code.
    waitForElementVisible('#emailVerificationControl_but_send_code').then(function () {
        var emailVal = $('#email').val();
        if (emailVal && emailVal.length) {
            return;
        }
        var stored;
        try { stored = sessionStorage.getItem('b2c_collected_email'); } catch (e) {}
        if (!stored) {
            return;
        }
        try { sessionStorage.removeItem('b2c_collected_email'); } catch (e) {}

        var emailInput = document.getElementById('email');
        if (!emailInput) {
            return;
        }
        var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(emailInput, stored);
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));

        $('.email_li').addClass('none');
        $('.intro').addClass('none');
        setTimeout(function () {
            $('#emailVerificationControl_but_send_code').click();
        }, 500);
    });

    $('#emailVerificationControl_but_verify_code').on('click', async function () {
        await waitForElementVisible('#emailVerificationControl_but_change_claims');

        $('.emailVerificationCode_li').addClass('none');
        const rePassword = $('.reenterPassword_li');
        const newPassword = $('.newPassword_li');
        $('#emailVerificationControl').addClass('none');

        if (rePassword.length && newPassword.length) {
            rePassword.show();
            newPassword.show();
            $('#attributeVerification > .buttons').addClass('flex');
        }
    });

    waitForButtonEnabled('continue').then(button => {
        $('#verifying_blurb').addClass('working')
        setTimeout(() => {
            button.click()
        }, 0)
    });
});