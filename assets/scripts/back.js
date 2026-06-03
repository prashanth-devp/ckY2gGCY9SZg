function createBackButton() {
  const backButton = $('<div>', {
    class: 'back-button',
    css: {
      display: 'flex',
      alignItems: 'center',
      cursor: 'pointer',
      marginBottom: '15px',
    },
  });

  const svgIcon = $('<img>', {
    src: 'https://opaleyes.com/adb2c/assets/images/left-icon.svg',
    alt: 'Back',
    css: {
      width: '14px',
      height: '20px',
      marginRight: '4px',
    },
  });

  const label = $('<span>', {
    text: 'Back',
    css: {
      fontWeight: '500',
    },
  });

  backButton.append(svgIcon, label);

  backButton.on('click', function () {
    window.history.back();
  });

  return backButton;
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

$(document).ready(function () {
  waitForElementVisible('#api').then(() => {
    $('#api').prepend(createBackButton());
  });
});
