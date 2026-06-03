function addRequiredSign()  {
    if (!window.SA_FIELDS || !window.SA_FIELDS.AttributeFields) return;
    window.SA_FIELDS.AttributeFields.forEach((block) => {
        const fields = block?.DISPLAY_FIELDS || [block];

        fields.forEach((field) => {
            if(!field.IS_REQ) return;

            const fieldLabel = $(`#${field.ID}_label`);
            fieldLabel.text(fieldLabel.text() + '*');
        })
    })
}

$(document).ready(function (){
    addRequiredSign()
})