import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightColorOf, SIGNALS_32_VERSION } from '../traffic-signals-32.js?v=32a';

test('lightColorOf ánh xạ phase → màu đèn', () => {
  assert.equal(SIGNALS_32_VERSION, 'signals-32a');
  assert.equal(lightColorOf('green'), 'green');
  assert.equal(lightColorOf('yellow'), 'yellow');
  assert.equal(lightColorOf('red'), 'red');
});
