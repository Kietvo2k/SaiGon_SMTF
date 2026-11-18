import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

function tapCounts(text) {
  const summary = /(?:^|\n)1\.\.\d+\r?\n# tests (\d+)\r?\n# suites \d+\r?\n# pass (\d+)\r?\n# fail (\d+)\r?\n# cancelled (\d+)\r?\n# skipped (\d+)\r?\n# todo (\d+)\r?\n# duration_ms [\d.]+\r?\n?$/.exec(text);
  if (!summary) throw new Error('Thiếu thống kê TAP cuối lượt chạy.');
  const [, total, passed, failed, cancelled, skipped, todo] = summary.map(Number);
  // Node có thể tính tệp không đăng ký test thành một ca thành công mang tên đường dẫn.
  const emptyFiles = [...text.matchAll(/^ok \d+ - .+\.(?:test|spec)\.[cm]?js\r?$/gm)].length;
  return { total: total - emptyFiles, passed: passed - emptyFiles, incomplete: failed + cancelled + skipped + todo + emptyFiles };
}

function vitestCounts(text) {
  const report = JSON.parse(text);
  const results = report.testResults.flatMap(suite => suite.assertionResults);
  if (report.success !== true || results.length !== report.numTotalTests ||
      results.filter(result => result.status === 'passed').length !== report.numPassedTests) {
    throw new Error('Kết quả Vitest và số ca báo cáo không khớp.');
  }
  return {
    total: report.numTotalTests,
    passed: report.numPassedTests,
    incomplete: report.numFailedTests + report.numPendingTests + report.numTodoTests,
  };
}

function junitCounts(text) {
  const suite = /<testsuites(?:\s+[^>]*)?>\s*<testsuite\s+([^>]+)>[\s\S]*<\/testsuite>\s*<\/testsuites>\s*$/.exec(text);
  if (!suite) throw new Error('Thiếu kết quả JUnit của pytest.');
  const attributes = new Map([...suite[1].matchAll(/(\w+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
  const numbers = ['tests', 'failures', 'errors', 'skipped'].map(name => {
    const raw = attributes.get(name);
    return /^\d+$/.test(raw ?? '') ? Number(raw) : NaN;
  });
  if (!numbers.every(Number.isSafeInteger) || [...text.matchAll(/<testcase\b/g)].length !== numbers[0]) {
    throw new Error('Kết quả JUnit và số ca báo cáo không khớp.');
  }
  const [total, failed, errors, skipped] = numbers;
  const incomplete = failed + errors + skipped;
  if (incomplete === 0 && /<(?:skipped|failure|error)\b/.test(text)) {
    throw new Error('Kết quả JUnit có ca lỗi hoặc bị bỏ qua.');
  }
  return { total, passed: total - incomplete, incomplete };
}

const reporters = { tap: tapCounts, vitest: vitestCounts, junit: junitCounts };

export function runCheck(check, { outputDir }) {
  const start = performance.now();
  const { id, command, args, cwd, timeoutMs, reporter = 'exit', reportPath, inspect, env } = check;
  const logs = [`${id}.stdout.log`, `${id}.stderr.log`];
  const result = (status, reason, message, details) => ({
    id,
    status,
    reason,
    message,
    elapsedMs: Math.round(performance.now() - start),
    logs,
    ...(details === undefined ? {} : { details }),
  });
  if (reportPath && existsSync(reportPath)) {
    return result('BLOCKED', 'stale-report', 'Đường dẫn báo cáo đã tồn tại từ trước lượt chạy.');
  }
  const childEnv = { ...process.env, ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  const child = spawnSync(command, args, {
    cwd,
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    windowsHide: true,
  });
  writeFileSync(join(outputDir, logs[0]), child.stdout ?? '', 'utf8');
  writeFileSync(join(outputDir, logs[1]), child.stderr ?? '', 'utf8');
  if (child.error) {
    const timeout = child.error.code === 'ETIMEDOUT';
    return result(timeout ? 'FAIL' : 'BLOCKED', timeout ? 'timeout' : 'spawn-error', child.error.message);
  }
  if (child.status !== 0) {
    return result('FAIL', 'exit-code', `Lệnh kết thúc với mã ${child.status ?? child.signal}.`);
  }
  if (reporter !== 'exit') {
    try {
      const parse = reporters[reporter];
      const source = reportPath ? readFileSync(reportPath, 'utf8') : child.stdout;
      const counts = parse(source);
      if (counts.total <= 0 || !Number.isSafeInteger(counts.total) ||
          counts.passed !== counts.total || counts.incomplete !== 0) {
        return result('FAIL', 'incomplete-tests', 'Bộ test rỗng hoặc có ca chưa đạt.', counts);
      }
      return result('PASS', 'tests-passed', `Đạt đủ ${counts.total} ca.`, counts);
    } catch (error) {
      return result('BLOCKED', 'invalid-report', error.message);
    }
  }
  if (inspect) {
    try {
      const validation = inspect(readFileSync(reportPath, 'utf8'));
      if (validation.ok !== true) {
        return result('FAIL', 'acceptance', validation.errors.join(' '), validation);
      }
      return result('PASS', 'acceptance-passed', 'Phép đo đạt tiêu chí.', validation);
    } catch (error) {
      return result('BLOCKED', 'invalid-report', error.message);
    }
  }
  return result('PASS', 'command-passed', 'Lệnh hoàn tất.');
}
