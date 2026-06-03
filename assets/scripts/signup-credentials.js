$(document).ready(function () {
    window.CONTENT.verifying_blurb = "";
    const intro = window.SA_FIELDS?.AttributeFields?.[0]?.PAT_DESC;

    if (intro) {
        $(`<div class="intro">${intro}</div>'`)
            .css('font-size', '14px')
            .insertBefore('#attributeVerification');
    }

    $('#continue').on('click', async function () {
        $('#simplemodal-data #verifying_blurb').addClass('working')
    });
});