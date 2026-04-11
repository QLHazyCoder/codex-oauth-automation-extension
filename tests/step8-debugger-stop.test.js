const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map(marker => source.indexOf(marker))
    .find(index => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i++) {
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
  for (; end < source.length; end++) {
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

const bundle = [
  extractFunction('throwIfStopped'),
  extractFunction('clickWithDebugger'),
].join('\n');

const api = new Function(`
let stopRequested = false;
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const commands = [];
let attachCount = 0;
let detachCount = 0;

const chrome = {
  debugger: {
    async attach(target, version) {
      attachCount += 1;
    },
    async sendCommand(target, command, payload) {
      commands.push(command);
      if (command === 'Page.bringToFront') {
        stopRequested = true;
      }
    },
    async detach(target) {
      detachCount += 1;
    },
  },
};

${bundle}

return {
  clickWithDebugger,
  snapshot() {
    return {
      commands,
      attachCount,
      detachCount,
    };
  },
};
`)();

(async () => {
  const error = await api.clickWithDebugger(123, { centerX: 10, centerY: 20 }).catch((err) => err);
  const state = api.snapshot();

  assert.strictEqual(error?.message, '流程已被用户停止。', 'debugger 点击过程中收到 Stop 后应终止');
  assert.deepStrictEqual(state.commands, ['Page.bringToFront'], 'Stop 后不应继续发送鼠标事件');
  assert.strictEqual(state.attachCount, 1, '应先附加 debugger');
  assert.strictEqual(state.detachCount, 1, '即使停止也应在 finally 中释放 debugger');

  console.log('step8 debugger stop tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
