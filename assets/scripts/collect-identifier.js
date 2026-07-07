$(document).ready(function () {
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

    // Pull the 10 national digits out of any phone-ish string, dropping a
    // leading "+1"/country-code "1" so we can rebuild clean E.164.
    function extractPhoneDigits(value) {
        var digits = value.replace(/\D/g, '');
        var despaced = value.replace(/\s/g, '');
        if (digits.length > 0 && digits.indexOf('1') === 0 && (despaced.indexOf('+1') === 0 || digits.length === 11)) {
            digits = digits.slice(1);
        }
        return digits.slice(0, 10);
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function showError(message) {
        var $error = $('#error');
        $error.text(message).show();
    }

    function clearError() {
        $('#error').text('').hide();
    }

    function formatPhone(digits) {
        digits = digits.slice(0, 10);
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return digits.slice(0, 3) + ' ' + digits.slice(3);
        return digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6);
    }

    function setNativeValue(input, value) {
        var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function suppressB2CPatternError() {
        var observer = new MutationObserver(function () {
            var $patternError = $('[id$="_pattern"]');
            if ($patternError.length && $patternError.is(':visible')) {
                var emailInput = document.getElementById('email');
                if (emailInput && isPhoneInput(emailInput.value) && isValidPhone(emailInput.value)) {
                    $patternError.hide();
                }
            }
            var $errorItems = $('.error.itemLevel');
            $errorItems.each(function () {
                var text = $(this).text().toLowerCase();
                if (text.indexOf('pattern') !== -1 || text.indexOf('valid email or phone') !== -1) {
                    var emailInput = document.getElementById('email');
                    if (emailInput && isPhoneInput(emailInput.value) && isValidPhone(emailInput.value)) {
                        $(this).hide();
                    }
                }
            });
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    }

    function waitForInput(callback) {
        var input = document.getElementById('email');
        if (input) { callback(input); return; }
        var observer = new MutationObserver(function () {
            input = document.getElementById('email');
            if (input) { observer.disconnect(); callback(input); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // "Already have an account? / Sign in to your account" — mirrors the sign-in
    // screen's "Don't have an account?" separator+link (see signin.js). This
    // (first) signup screen is reached from sign-in via a full-page
    // flow_hint=sign_up navigation, so history.back() returns to sign-in — the
    // same mechanism the header "Back" control uses (back.js).
    function addSignInLink() {
        if (document.getElementById('signInLink')) return;
        var api = document.getElementById('api');
        if (!api) return;

        var separator = document.createElement('div');
        separator.className = 'separator';
        separator.innerHTML = '<hr />Already have an account?<hr />';

        var link = document.createElement('a');
        link.id = 'signInLink';
        link.href = '#';
        link.className = 'link';
        link.textContent = 'Sign in to your account';
        link.style.display = 'block';
        link.style.textAlign = 'center';
        link.addEventListener('click', function (e) {
            e.preventDefault();
            window.history.back();
        });

        api.appendChild(separator);
        api.appendChild(link);
    }

    waitForInput(function (emailInput) {
        emailInput.removeAttribute('pattern');
        addSignInLink();

        var patternObserver = new MutationObserver(function () {
            if (emailInput.hasAttribute('pattern')) {
                emailInput.removeAttribute('pattern');
            }
        });
        patternObserver.observe(emailInput, { attributes: true, attributeFilter: ['pattern'] });

        // Option A: the real B2C field (#email) must always hold a clean value
        // (email as typed, or "+1XXXXXXXXXX" for phone) because B2C reads it
        // directly when "Send verification code" fires. We never put display
        // spaces into it; instead a separate visible input shows the pretty
        // "+1 123 456 7890" mask.
        if (document.getElementById('email-display')) return;

        var displayInput = document.createElement('input');
        displayInput.id = 'email-display';
        displayInput.type = 'text';
        displayInput.className = emailInput.className;
        displayInput.placeholder = emailInput.placeholder || 'Email or phone number';
        displayInput.setAttribute('autocomplete', 'off');
        var emailAriaLabel = emailInput.getAttribute('aria-label');
        if (emailAriaLabel) displayInput.setAttribute('aria-label', emailAriaLabel);

        // Hide the real input but keep it in the DOM for B2C binding/submission.
        emailInput.style.display = 'none';
        emailInput.setAttribute('aria-hidden', 'true');
        emailInput.tabIndex = -1;
        emailInput.parentNode.insertBefore(displayInput, emailInput);

        function pretty(value) {
            var digits = extractPhoneDigits(value);
            return digits.length > 0 ? '+1 ' + formatPhone(digits) : '';
        }

        function clean(value) {
            var digits = extractPhoneDigits(value);
            return digits.length > 0 ? '+1' + digits : '';
        }

        displayInput.addEventListener('input', function () {
            var raw = displayInput.value;
            if (isPhoneInput(raw)) {
                var formatted = pretty(raw);
                if (displayInput.value !== formatted) {
                    displayInput.value = formatted; // caret moves to end (matches prior behavior)
                }
                setNativeValue(emailInput, clean(raw));
            } else {
                // Email (or empty): mirror straight through to the real field.
                setNativeValue(emailInput, raw);
            }
        });

        // Keep the display in sync if B2C disables/locks the field after sending.
        var stateObserver = new MutationObserver(function () {
            displayInput.disabled = emailInput.disabled;
            displayInput.readOnly = emailInput.readOnly;
        });
        stateObserver.observe(emailInput, { attributes: true, attributeFilter: ['disabled', 'readonly'] });

        // Seed the mask from any value B2C pre-filled (e.g. back navigation).
        if (emailInput.value) {
            displayInput.value = isPhoneInput(emailInput.value) ? pretty(emailInput.value) : emailInput.value;
        }

        displayInput.focus();
    });

    suppressB2CPatternError();

    $('#continue').on('click', function (e) {
        clearError();
        var emailInput = document.getElementById('email');
        if (emailInput) {
            var value = emailInput.value.trim();
            if (!value) {
                e.stopImmediatePropagation();
                showError('Please enter an email address or phone number.');
                return false;
            }
            if (isPhoneInput(value)) {
                if (!isValidPhone(value)) {
                    e.stopImmediatePropagation();
                    showError('Please enter a valid 10-digit phone number.');
                    return false;
                }
                // #email already holds clean "+1XXXXXXXXXX" (kept in sync by the
                // masked display input), so nothing to normalize here.
            } else {
                if (!isValidEmail(value)) {
                    e.stopImmediatePropagation();
                    showError('Please enter a valid email address.');
                    return false;
                }
                try { sessionStorage.setItem('b2c_collected_email', value); } catch(ex) {}
            }
        }
        $('#simplemodal-data #verifying_blurb').hide();
    });
});
