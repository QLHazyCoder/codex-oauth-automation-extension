const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => sidepanelSource.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < sidepanelSource.length; i += 1) {
    const ch = sidepanelSource[i];
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

  let depth = 0;
  let end = braceStart;
  for (; end < sidepanelSource.length; end += 1) {
    const ch = sidepanelSource[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return sidepanelSource.slice(start, end);
}

const helperBundle = [
  extractFunction('getContributionUpdatePromptLines'),
  extractFunction('getContributionUpdateHintMessage'),
].join('\n');

const api = new Function(`
${helperBundle}
return {
  getContributionUpdatePromptLines,
  getContributionUpdateHintMessage,
};
`)();

test('getContributionUpdateHintMessage numbers contribution updates when both content and questionnaire are visible', () => {
  const message = api.getContributionUpdateHintMessage({
    promptVersion: 'announcement:2026-04-23T00:00:00Z|questionnaire:2026-04-23T00:00:01Z',
    items: [
      { slug: 'announcement', isVisible: true },
      { slug: 'questionnaire', isVisible: true },
    ],
  });

  assert.equal(
    message,
    '1. 公告 / 使用教程有更新了，可点上方“贡献/使用”查看。\n2. 有新的征求意见，请佬友共同参与选择。'
  );
});

test('getContributionUpdateHintMessage returns questionnaire prompt alone when only questionnaire is updated', () => {
  const message = api.getContributionUpdateHintMessage({
    promptVersion: 'questionnaire:2026-04-23T00:00:01Z',
    items: [
      { slug: 'questionnaire', isVisible: true },
    ],
  });

  assert.equal(message, '有新的征求意见，请佬友共同参与选择。');
});
