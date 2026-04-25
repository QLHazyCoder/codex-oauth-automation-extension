(function attachPhoneAuthModule(root, factory) {
  root.MultiPagePhoneAuth = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createPhoneAuthModule() {
  function createPhoneAuthHelpers(deps = {}) {
    const {
      fillInput,
      getActionText,
      getPageTextSnapshot,
      getVerificationErrorText,
      humanPause,
      isActionEnabled,
      isAddPhonePageReady,
      isConsentReady,
      isPhoneVerificationPageReady,
      isVisibleElement,
      simulateClick,
      sleep,
      throwIfStopped,
      waitForElement,
    } = deps;

    function dispatchInputEvents(element) {
      if (!element) return;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function normalizePhoneDigits(value) {
      let digits = String(value || '').replace(/\D+/g, '');
      if (digits.startsWith('00')) {
        digits = digits.slice(2);
      }
      return digits;
    }

    function normalizeCountryLabel(value) {
      return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }

    function getOptionLabel(option) {
      return String(option?.textContent || option?.label || '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function extractDialCodeFromText(value) {
      const match = String(value || '').match(/\(\+\s*(\d{1,4})\s*\)|\+\s*(\d{1,4})\b/);
      return String(match?.[1] || match?.[2] || '').trim();
    }

    function getCountryButtonText() {
      const form = getAddPhoneForm();
      if (!form) return '';
      const button = form.querySelector('button[aria-haspopup="listbox"]');
      if (!button) return '';
      const valueNode = button.querySelector('.react-aria-SelectValue');
      return String(valueNode?.textContent || button.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function getDisplayedDialCode() {
      const buttonDialCode = extractDialCodeFromText(getCountryButtonText());
      if (buttonDialCode) {
        return buttonDialCode;
      }

      const phoneInput = getPhoneInput();
      const fieldRoot = phoneInput?.closest('fieldset') || phoneInput?.closest('form') || getAddPhoneForm();
      if (!fieldRoot) {
        return '';
      }

      const visibleSpan = Array.from(fieldRoot.querySelectorAll('span'))
        .find((element) => isVisibleElement(element) && /^\d{1,4}$/.test(String(element.textContent || '').trim()));
      return String(visibleSpan?.textContent || '').trim();
    }

    function toNationalPhoneNumber(value, dialCode) {
      const digits = normalizePhoneDigits(value);
      const normalizedDialCode = normalizePhoneDigits(dialCode);
      if (!digits) {
        return '';
      }
      if (normalizedDialCode && digits.startsWith(normalizedDialCode) && digits.length > normalizedDialCode.length) {
        return digits.slice(normalizedDialCode.length);
      }
      return digits;
    }

    function toE164PhoneNumber(value, dialCode) {
      const digits = normalizePhoneDigits(value);
      const normalizedDialCode = normalizePhoneDigits(dialCode);
      if (!digits) {
        return '';
      }
      if (!normalizedDialCode) {
        return digits.startsWith('+') ? digits : `+${digits}`;
      }
      if (digits.startsWith(normalizedDialCode)) {
        return `+${digits}`;
      }
      if (digits.startsWith('0')) {
        return `+${normalizedDialCode}${digits.slice(1)}`;
      }
      return `+${normalizedDialCode}${digits}`;
    }

    function getAddPhoneForm() {
      return document.querySelector('form[action*="/add-phone" i]');
    }

    function getPhoneVerificationForm() {
      return document.querySelector('form[action*="/phone-verification" i]');
    }

    function getPhoneInput() {
      const form = getAddPhoneForm();
      if (!form) return null;
      const input = form.querySelector(
        'input[type="tel"], input[name="__reservedForPhoneNumberInput_tel"], input[autocomplete="tel"]'
      );
      return input && isVisibleElement(input) ? input : null;
    }

    function getHiddenPhoneNumberInput() {
      const form = getAddPhoneForm();
      if (!form) return null;
      return form.querySelector('input[name="phoneNumber"]');
    }

    function getCountrySelect() {
      const form = getAddPhoneForm();
      if (!form) return null;
      return form.querySelector('select');
    }

    function getSelectedCountryOption() {
      const select = getCountrySelect();
      if (!select || select.selectedIndex < 0) {
        return null;
      }
      return select.options[select.selectedIndex] || null;
    }

    function findCountryOptionByLabel(countryLabel) {
      const select = getCountrySelect();
      if (!select) {
        return null;
      }
      const normalizedTarget = normalizeCountryLabel(countryLabel);
      if (!normalizedTarget) {
        return null;
      }

      const options = Array.from(select.options);
      return options.find((option) => normalizeCountryLabel(getOptionLabel(option)) === normalizedTarget)
        || options.find((option) => {
          const optionLabel = normalizeCountryLabel(getOptionLabel(option));
          return optionLabel && (optionLabel.includes(normalizedTarget) || normalizedTarget.includes(optionLabel));
        })
        || null;
    }

    async function ensureCountrySelected(countryLabel) {
      const select = getCountrySelect();
      if (!select) {
        return false;
      }

      const targetOption = findCountryOptionByLabel(countryLabel);
      if (!targetOption) {
        throw new Error(`Add-phone page is missing the country option for "${countryLabel}".`);
      }

      const selectedOption = getSelectedCountryOption();
      if (selectedOption && normalizeCountryLabel(getOptionLabel(selectedOption)) === normalizeCountryLabel(getOptionLabel(targetOption))) {
        return true;
      }

      select.value = String(targetOption.value || '');
      dispatchInputEvents(select);
      await sleep(250);

      const nextSelectedOption = getSelectedCountryOption();
      return Boolean(
        nextSelectedOption
        && normalizeCountryLabel(getOptionLabel(nextSelectedOption)) === normalizeCountryLabel(getOptionLabel(targetOption))
      );
    }

    function getAddPhoneSubmitButton() {
      const form = getAddPhoneForm();
      if (!form) return null;
      const buttons = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));
      return buttons.find((button) => isVisibleElement(button) && isActionEnabled(button))
        || buttons.find((button) => isVisibleElement(button))
        || null;
    }

    function getPhoneVerificationCodeInput() {
      const form = getPhoneVerificationForm();
      if (!form) return null;
      const input = form.querySelector(
        'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
      );
      return input && isVisibleElement(input) ? input : null;
    }

    function getPhoneVerificationSubmitButton() {
      const form = getPhoneVerificationForm();
      if (!form) return null;
      const buttons = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));
      return buttons.find((button) => {
        if (!isVisibleElement(button) || !isActionEnabled(button)) return false;
        const intent = String(button.getAttribute('value') || '').trim().toLowerCase();
        if (intent === 'resend') return false;
        return true;
      }) || buttons.find((button) => isVisibleElement(button));
    }

    function getPhoneVerificationResendButton(options = {}) {
      const { allowDisabled = false } = options;
      const form = getPhoneVerificationForm();
      if (!form) return null;
      const buttons = Array.from(form.querySelectorAll('button, input[type="submit"], input[type="button"]'));
      return buttons.find((button) => {
        if (!isVisibleElement(button)) return false;
        if (!allowDisabled && !isActionEnabled(button)) return false;
        const intent = String(button.getAttribute('value') || '').trim().toLowerCase();
        if (intent === 'resend') return true;
        return /resend/i.test(getActionText(button));
      }) || null;
    }

    function getPhoneVerificationDisplayedPhone() {
      const text = getPageTextSnapshot();
      const matches = text.match(/\+\d[\d\s-]{6,}\d/g);
      return matches?.[0] ? matches[0].replace(/\s+/g, ' ').trim() : '';
    }

    async function waitForAddPhoneReady(timeout = 20000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        throwIfStopped();
        if (isAddPhonePageReady()) {
          return true;
        }
        await sleep(150);
      }
      throw new Error('Timed out waiting for add-phone page.');
    }

    async function waitForPhoneVerificationReady(timeout = 20000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        throwIfStopped();
        if (isPhoneVerificationPageReady()) {
          return {
            phoneVerificationPage: true,
            displayedPhone: getPhoneVerificationDisplayedPhone(),
            url: location.href,
          };
        }
        await sleep(150);
      }
      throw new Error('Timed out waiting for phone verification page.');
    }

    async function submitPhoneNumber(payload = {}) {
      const countryLabel = String(payload.countryLabel || '').trim();
      if (!countryLabel) {
        throw new Error('Missing country label for add-phone submission.');
      }

      await waitForAddPhoneReady();
      const countrySelected = await ensureCountrySelected(countryLabel);
      if (!countrySelected) {
        throw new Error(`Failed to select "${countryLabel}" on the add-phone page.`);
      }

      const dialCode = getDisplayedDialCode();
      if (!dialCode) {
        throw new Error(`Could not determine the dial code for "${countryLabel}" on the add-phone page.`);
      }

      const phoneNumber = toE164PhoneNumber(payload.phoneNumber, dialCode);
      const nationalPhoneNumber = toNationalPhoneNumber(payload.phoneNumber, dialCode);
      if (!phoneNumber || !nationalPhoneNumber) {
        throw new Error('Missing phone number for add-phone submission.');
      }

      const phoneInput = getPhoneInput() || await waitForElement(
        'input[type="tel"], input[name="__reservedForPhoneNumberInput_tel"], input[autocomplete="tel"]',
        10000
      );
      const hiddenPhoneNumberInput = getHiddenPhoneNumberInput();
      const submitButton = getAddPhoneSubmitButton();

      if (!phoneInput) {
        throw new Error('Add-phone page is missing the phone number input.');
      }
      if (!submitButton) {
        throw new Error('Add-phone page is missing the submit button.');
      }

      await humanPause(250, 700);
      fillInput(phoneInput, nationalPhoneNumber);
      if (hiddenPhoneNumberInput) {
        hiddenPhoneNumberInput.value = phoneNumber;
        dispatchInputEvents(hiddenPhoneNumberInput);
      }
      await sleep(250);
      simulateClick(submitButton);
      return waitForPhoneVerificationReady();
    }

    async function waitForPhoneVerificationOutcome(timeout = 30000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        throwIfStopped();

        const errorText = getVerificationErrorText();
        if (errorText) {
          return {
            invalidCode: true,
            errorText,
            url: location.href,
          };
        }

        if (isConsentReady()) {
          return {
            success: true,
            consentReady: true,
            url: location.href,
          };
        }

        if (isAddPhonePageReady()) {
          return {
            returnedToAddPhone: true,
            url: location.href,
          };
        }

        await sleep(150);
      }

      if (isPhoneVerificationPageReady()) {
        return {
          invalidCode: true,
          errorText: getVerificationErrorText() || 'Phone verification page stayed in place after code submission.',
          url: location.href,
        };
      }

      return {
        success: true,
        assumed: true,
        url: location.href,
      };
    }

    async function submitPhoneVerificationCode(payload = {}) {
      const code = String(payload.code || '').trim();
      if (!code) {
        throw new Error('Missing phone verification code.');
      }

      await waitForPhoneVerificationReady();
      const codeInput = getPhoneVerificationCodeInput() || await waitForElement(
        'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
        10000
      );
      const submitButton = getPhoneVerificationSubmitButton();

      if (!codeInput) {
        throw new Error('Phone verification page is missing the code input.');
      }
      if (!submitButton) {
        throw new Error('Phone verification page is missing the submit button.');
      }

      await humanPause(250, 700);
      fillInput(codeInput, code);
      await sleep(250);
      simulateClick(submitButton);
      return waitForPhoneVerificationOutcome();
    }

    async function resendPhoneVerificationCode(timeout = 45000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        throwIfStopped();
        const resendButton = getPhoneVerificationResendButton({ allowDisabled: true });
        if (resendButton && isActionEnabled(resendButton)) {
          await humanPause(250, 700);
          simulateClick(resendButton);
          await sleep(1000);
          return {
            resent: true,
            url: location.href,
          };
        }
        await sleep(250);
      }

      throw new Error('Timed out waiting for the phone verification resend button.');
    }

    async function returnToAddPhone(timeout = 20000) {
      if (isAddPhonePageReady()) {
        return {
          addPhonePage: true,
          url: location.href,
        };
      }

      if (!isPhoneVerificationPageReady()) {
        throw new Error('The auth page is not currently on phone verification or add-phone page.');
      }

      location.assign('/add-phone');
      await waitForAddPhoneReady(timeout);
      return {
        addPhonePage: true,
        url: location.href,
      };
    }

    return {
      getPhoneVerificationDisplayedPhone,
      isPhoneVerificationPageReady,
      resendPhoneVerificationCode,
      returnToAddPhone,
      submitPhoneNumber,
      submitPhoneVerificationCode,
      toE164PhoneNumber,
    };
  }

  return {
    createPhoneAuthHelpers,
  };
});
