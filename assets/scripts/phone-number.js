function waitForInputEnabled(inputIds) {
    const ids = Array.isArray(inputIds) ? inputIds : [inputIds];
    return new Promise(resolve => {
        const found = ids.map(id => document.getElementById(id)).find(Boolean);
        if (found) {
            resolve(found);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            const found = ids.map(id => document.getElementById(id)).find(Boolean);
            if (found) {
                obs.disconnect();
                resolve(found);
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

$(document).ready(async function () {
    // Handle both 'phone' (MFA control pages) and 'phoneNumber' (collection page)
    const originalPhoneInput = await waitForInputEnabled(['phone', 'phoneNumber']);

    if(!originalPhoneInput) {
        return
    }

    // Hide the original input
    originalPhoneInput.style.display = 'none';

    // Create a new visible input for formatted phone number
    const formattedPhoneInput = document.createElement('input');
    formattedPhoneInput.id = 'formatted-phone';
    formattedPhoneInput.className = 'textInput';
    formattedPhoneInput.type = 'text';
    formattedPhoneInput.placeholder = '+1 123 456 7890';
    formattedPhoneInput.title = 'Enter phone';
    formattedPhoneInput.autofocus = true;

    // Insert the new input before the hidden one
    originalPhoneInput.parentNode.insertBefore(formattedPhoneInput, originalPhoneInput);

    // Pull the 10-digit national number out of whatever is in the field. A
    // leading "1" is treated as the country code (and dropped) only when it's
    // clearly one — the value starts with "+1" or there are 11 digits — so a
    // user typing an area code that happens to start with "1" isn't mangled.
    // Mirrors extractPhoneDigits in collect-identifier.js.
    function extractNationalDigits(value) {
        var digits = value.replace(/\D/g, '');
        var despaced = value.replace(/\s/g, '');
        if (digits.length > 0 && digits.indexOf('1') === 0 && (despaced.indexOf('+1') === 0 || digits.length === 11)) {
            digits = digits.slice(1);
        }
        return digits.slice(0, 10);
    }

    // Format the national number as "+1 123 456 7890", building it up
    // incrementally so partial input formats cleanly while typing.
    function formatPhoneNumber(value) {
        var digits = extractNationalDigits(value);
        if (!digits.length) return '';
        if (digits.length <= 3) return '+1 ' + digits;
        if (digits.length <= 6) return '+1 ' + digits.slice(0, 3) + ' ' + digits.slice(3);
        return '+1 ' + digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6);
    }

    // Keep the hidden B2C-bound input in clean E.164 (+1XXXXXXXXXX).
    function updateHiddenInput(formattedValue) {
        var digits = extractNationalDigits(formattedValue);
        originalPhoneInput.value = digits.length > 0 ? '+1' + digits : '';
    }

    // Reformat as the user types and mirror the clean value into the hidden
    // field. The caret is moved to the end after formatting (matches the
    // behavior in collect-identifier.js) — simplest reliable option once the
    // fixed "+1 " prefix is in play.
    formattedPhoneInput.addEventListener('input', function () {
        var formattedValue = formatPhoneNumber(this.value);
        this.value = formattedValue;
        updateHiddenInput(formattedValue);
        var len = this.value.length;
        this.setSelectionRange(len, len);
    });

    // Handle initial value if any (e.g. a pre-filled "+1XXXXXXXXXX").
    if (originalPhoneInput.value) {
        formattedPhoneInput.value = formatPhoneNumber(originalPhoneInput.value);
    }
});
