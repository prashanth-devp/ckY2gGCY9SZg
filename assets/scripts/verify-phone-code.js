$(document).ready(function () {
  window.CONTENT.verifying_blurb = '';

  var resendTimerInterval = null;

  function startResendTimer() {
    if (resendTimerInterval) clearInterval(resendTimerInterval);

    var $btn = $('#phoneVerificationControl_but_send_new_code');
    var label = $btn.text().replace(/\s*\(\d+s\)$/, '').trim() || 'Resend code';
    var remaining = 60;

    $btn.text(label + ' (' + remaining + 's)');
    $btn.css({ 'pointer-events': 'none', 'opacity': '0.6' });

    resendTimerInterval = setInterval(function () {
      remaining--;
      if (remaining <= 0) {
        clearInterval(resendTimerInterval);
        resendTimerInterval = null;
        $btn.text(label);
        $btn.css({ 'pointer-events': '', 'opacity': '' });
      } else {
        $btn.text(label + ' (' + remaining + 's)');
      }
    }, 1000);
  }

  function waitForElementVisible(selector) {
    return new Promise((resolve) => {
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
        attributeFilter: ['style', 'class'],
      });
    });
  }

  function waitForButtonEnabled(buttonId) {
    return new Promise((resolve) => {
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
        attributeFilter: ['aria-disabled'],
      });
    });
  }

  $('#phoneVerificationControl_but_send_code').on('click', async function () {
    await waitForElementVisible('.verificationCode_li');

    $('#api').show();
    const introMessage = window?.SA_FIELDS.AttributeFields[0]?.DISPLAY_CONTROL_CONTENT?.intro_msg;
    if (introMessage) {
      $('#api h1').text(introMessage);
    }

    $('.phone_li').addClass('none');
    $('.intro').addClass('none');
    startResendTimer();
  });

  $('#phoneVerificationControl_but_send_new_code').on('click', function () {
    startResendTimer();
  });

  $('#phoneVerificationControl_but_verify_code').on('click', async function () {
    await waitForElementVisible('#phoneVerificationControl_but_change_claims');

    $('#phoneVerificationControl_success_message').hide();
    $('.phoneVerificationCode_li').addClass('none');
    const rePassword = $('.reenterPassword_li');
    const newPassword = $('.newPassword_li');
    $('#phoneVerificationControl').addClass('none');
    $('.phone_li').addClass('none');
    $('#api').hide();

    if (rePassword.length && newPassword.length) {
      $('#api').show();
      rePassword.show();
      newPassword.show();
      $('#attributeVerification > .buttons').addClass('flex');
    } else {
      var continueBtn = document.getElementById('continue');
      if (continueBtn) {
        continueBtn.click();
      }
    }
  });

  waitForElementVisible('#phoneVerificationControl_but_send_code').then(() => {
    if ($('#phone').val().trim() !== '') {
      $('#api').hide();
      $('#phoneVerificationControl_but_send_code').click();
    }
  });
});
