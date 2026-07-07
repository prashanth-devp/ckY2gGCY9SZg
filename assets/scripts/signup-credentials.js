$(document).ready(function () {
    window.CONTENT.verifying_blurb = "";
    const intro = window.SA_FIELDS.AttributeFields[0].PAT_DESC;

    if (intro) {
        // Show the password requirements directly below the "Create password" field
        // (between Create and Confirm) rather than above the whole form.
        const $help = $(`<div class="password-requirements">${intro}</div>`).css({
            'font-size': '14px',
            color: '#5A6A72',
            margin: '4px 0 16px 0',
        });
        const $createPasswordItem = $('#newPassword').closest('li');
        if ($createPasswordItem.length) {
            $help.insertAfter($createPasswordItem);
        } else {
            $help.insertBefore('#attributeVerification');
        }
    }

    $('#continue').on('click', async function () {
        $('#simplemodal-data #verifying_blurb').addClass('working')
    });
});