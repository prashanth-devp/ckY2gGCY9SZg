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
    formattedPhoneInput.placeholder = '(123) 456-6789';
    formattedPhoneInput.title = 'Enter phone';
    formattedPhoneInput.autofocus = true;

    // Insert the new input before the hidden one
    originalPhoneInput.parentNode.insertBefore(formattedPhoneInput, originalPhoneInput);

    // Function to format phone number as (123) 456-7890
    function formatPhoneNumber(value) {
        // Remove all non-digit characters
        const digits = value.replace(/\D/g, '');

        // Format the phone number
        if (digits.length <= 3) {
            return digits.length ? `(${digits}` : '';
        } else if (digits.length <= 6) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        } else {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
        }
    }

    // Function to update the hidden input with +1 format
    function updateHiddenInput(formattedValue) {
        // Extract digits only
        const digits = formattedValue.replace(/\D/g, '');

        // Only update if we have digits
        if (digits.length > 0) {
            // Format as +1 followed by digits
            originalPhoneInput.value = `+1${digits}`;
        } else {
            originalPhoneInput.value = '';
        }
    }

    // Add event listener to format the input and update hidden field
    formattedPhoneInput.addEventListener('input', function(e) {
        // Get current cursor position and value before formatting
        const cursorPos = this.selectionStart;
        const oldValue = this.value;
        const oldLength = oldValue.length;

        // Count digits before cursor in the old value
        const digitCountBeforeCursor = oldValue.substring(0, cursorPos).replace(/\D/g, '').length;

        // Format the phone number
        const formattedValue = formatPhoneNumber(this.value);
        this.value = formattedValue;

        // Update the hidden input
        updateHiddenInput(formattedValue);

        // Calculate new cursor position based on digit count
        let newPos = 0;
        let currentDigitCount = 0;

        // Iterate through the formatted value to find the position after the same number of digits
        for (let i = 0; i < formattedValue.length; i++) {
            if (/\d/.test(formattedValue[i])) {
                currentDigitCount++;
            }
            if (currentDigitCount > digitCountBeforeCursor) {
                break;
            }
            newPos = i + 1;
        }

        // Set cursor position
        this.setSelectionRange(newPos, newPos);
    });

    // Handle initial value if any
    if (originalPhoneInput.value) {
        formattedPhoneInput.value = formatPhoneNumber(originalPhoneInput.value.replace(/^\+1/, ''));
    }
});
