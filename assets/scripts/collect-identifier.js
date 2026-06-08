$(document).ready(function () {
    var isFormatting = false;

    function isPhoneInput(value) {
        return value.length > 0 && !value.includes('@') && /\d/.test(value);
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

    function waitForInput(callback) {
        var input = document.getElementById('email');
        if (input) { callback(input); return; }
        var observer = new MutationObserver(function () {
            input = document.getElementById('email');
            if (input) { observer.disconnect(); callback(input); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    waitForInput(function (emailInput) {
        $(emailInput).on('input', function () {
            if (isFormatting) return;
            var value = this.value;
            if (!isPhoneInput(value)) return;

            var digits = value.replace(/\D/g, '');
            if (digits.length > 0 && digits.indexOf('1') === 0 && value.replace(/\s/g, '').indexOf('+1') === 0) {
                digits = digits.slice(1);
            }
            var formatted = digits.length > 0 ? '+1 ' + formatPhone(digits) : '';
            if (this.value === formatted) return;

            isFormatting = true;
            var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(this, formatted);
            this.dispatchEvent(new Event('input', { bubbles: true }));
            isFormatting = false;
        });
    });

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
                var digits = value.replace(/\D/g, '');
                if (digits.indexOf('1') === 0) {
                    digits = digits.slice(1);
                }
                isFormatting = true;
                setNativeValue(emailInput, '+1' + digits);
                isFormatting = false;
            } else {
                if (!isValidEmail(value)) {
                    e.stopImmediatePropagation();
                    showError('Please enter a valid email address.');
                    return false;
                }
            }
        }
        $('#simplemodal-data #verifying_blurb').addClass('working');
    });
});
