function addRequiredSign() {
  if (!window.SA_FIELDS || !window.SA_FIELDS.AttributeFields) return;
  window.SA_FIELDS.AttributeFields.forEach((block) => {
    const fields = block?.DISPLAY_FIELDS || [block];
    fields.forEach((field) => {
      if (!field.IS_REQ) return;
      const fieldLabel = $(`#${field.ID}_label`);
      fieldLabel.text(fieldLabel.text() + '*');
    });
  });
}

function navigateToPasswordless() {
  // Reads the current B2C authorize URL and re-issues it with flow_hint=passwordless
  var url = new URL(window.location.href);
  url.searchParams.set("flow_hint", "passwordless");
  window.location.href = url.toString();
}

function navigateToSignUp() {
  // Reads the current B2C authorize URL and re-issues it with flow_hint=sign_up
  var url = new URL(window.location.href);
  url.searchParams.set("flow_hint", "sign_up");
  window.location.href = url.toString();
}

$(document).ready(function () {
  addRequiredSign();

  // Bind secondary button
  $("#btn-passwordless").on("click", function () {
    navigateToPasswordless();
  });

  // Bind sign up link
  $("#btn-signup").on("click", function (e) {
    e.preventDefault();
    navigateToSignUp();
  });
});