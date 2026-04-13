const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

function extractConst(name) {
  const start = source.indexOf(`const ${name} = `);
  if (start < 0) {
    throw new Error(`missing const ${name}`);
  }

  const semicolon = source.indexOf(';', start);
  if (semicolon < 0) {
    throw new Error(`missing semicolon for const ${name}`);
  }

  return source.slice(start, semicolon + 1);
}

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

test('matchesAuthTimeoutErrorPage recognizes error occurred when Try again is visible', () => {
  const api = new Function(`
${extractConst('AUTH_TIMEOUT_ERROR_TITLE_PATTERN')}
${extractConst('AUTH_TIMEOUT_ERROR_DETAIL_PATTERN')}
${extractFunction('getAuthRetryButton')}
${extractFunction('matchesAuthTimeoutErrorPage')}

let pageText = '';
let titleText = '';
let pathname = '/log-in';
let retryButton = null;

const location = {
  get pathname() {
    return pathname;
  },
};
const document = {
  querySelector(selector) {
    if (selector === 'button[data-dd-action-name="Try again"]') {
      return retryButton;
    }
    return null;
  },
  querySelectorAll() {
    return retryButton ? [retryButton] : [];
  },
  get title() {
    return titleText;
  },
};

function isVisibleElement() {
  return true;
}

function isActionEnabled(element) {
  return element?.getAttribute?.('aria-disabled') !== 'true';
}

function getActionText(element) {
  return [
    element?.textContent,
    element?.getAttribute?.('aria-label'),
    element?.getAttribute?.('title'),
    element?.getAttribute?.('data-dd-action-name'),
  ].filter(Boolean).join(' ').trim();
}

function getPageTextSnapshot() {
  return pageText;
}

return {
  matchesAuthTimeoutErrorPage,
  setState(nextState = {}) {
    pageText = nextState.pageText ?? pageText;
    titleText = nextState.titleText ?? titleText;
    pathname = nextState.pathname ?? pathname;
    retryButton = nextState.retryButton ?? retryButton;
  },
};
`)();

  const button = {
    textContent: 'Try again',
    getAttribute(name) {
      const attrs = {
        'aria-disabled': 'false',
        'data-dd-action-name': 'Try again',
      };
      return attrs[name] ?? null;
    },
  };

  api.setState({
    retryButton: button,
    pageText: 'Oops, an error occurred! Please try again.',
    titleText: 'An error occurred',
    pathname: '/log-in',
  });

  assert.equal(
    api.matchesAuthTimeoutErrorPage(/\/log-in(?:[/?#]|$)/i),
    true
  );
});
