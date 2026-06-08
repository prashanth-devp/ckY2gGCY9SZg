$(document).ready(function () {
  window.CONTENT.verifying_blurb = '';

  var resendTimerInterval = null;

  function startResendTimer() {
    if (resendTimerInterval) clearInterval(resendTimerInterval);

    var $btn = $('#emailVerificationControl_but_send_new_code');
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

  $('#emailVerificationControl_but_send_code').on('click', async function () {
    await waitForElementVisible('.verificationCode_li');

    const introMessage = window?.SA_FIELDS.AttributeFields[0]?.DISPLAY_CONTROL_CONTENT?.intro_msg;
    if (introMessage) {
      $('#api h1').text(introMessage);
    }

    $('.email_li').addClass('none');
    $('.intro').addClass('none');
    startResendTimer();
  });

  $('#emailVerificationControl_but_send_new_code').on('click', function () {
    startResendTimer();
  });

  $('#emailVerificationControl_but_verify_code').on('click', async function () {
    await waitForElementVisible('#emailVerificationControl_but_change_claims');

    $('.emailVerificationCode_li').addClass('none');
    const rePassword = $('.reenterPassword_li');
    const newPassword = $('.newPassword_li');
    $('#emailVerificationControl').addClass('none');
    $('.email_li').addClass('none');

    if (rePassword.length && newPassword.length) {
      rePassword.show();
      newPassword.show();
      $('#attributeVerification > .buttons').css('display', 'flex');
    } else {
      waitForButtonEnabled('continue').then(function (btn) {
        btn.click();
      });
    }
  });

  waitForElementVisible('#emailVerificationControl_but_send_code').then(() => {
    if ($('#email').val().length) {
      $('#emailVerificationControl_but_send_code').click();
    }
  });
});
