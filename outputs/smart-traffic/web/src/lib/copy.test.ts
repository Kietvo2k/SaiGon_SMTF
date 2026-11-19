import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';

// Ràng buộc chữ hiển thị (M1 §9.3, brief M4c): không dùng các cụm giả lập/mô phỏng/demo, không nêu tên CSGT hay Bộ Công an.
const BANNED = ['giả lập', 'mô phỏng', 'minh họa', 'illustrative', 'simulated', 'demo', 'fake', 'csgt', 'bộ công an'];
const SOURCES = import.meta.glob('../**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const PAGES = import.meta.glob('../../*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function bannedCopy(path: string, text: string): string[] {
  let copy = text;
  if (/\.tsx?$/.test(path)) {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const technical: Array<[number, number]> = [];
    const factories = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
        || statement.moduleSpecifier.text !== '../../../../shared/public-demo/traffic-transport.js') continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const item of bindings.elements) {
          if ((item.propertyName ?? item.name).text === 'createTrafficTransport') factories.add(item.name.text);
        }
      }
    }
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        && node.moduleSpecifier.text === '../../../../shared/public-demo/traffic-transport.js') {
        technical.push([node.moduleSpecifier.getStart(source), node.moduleSpecifier.end]);
      }
      if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)
        && node.literal.text === 'public-demo-v1') {
        technical.push([node.literal.getStart(source), node.literal.end]);
      }
      if (ts.isStringLiteral(node) && node.text === 'public-demo-v1') {
        const fallback = node.parent;
        const property = fallback?.parent;
        const options = property?.parent;
        const call = options?.parent;
        if (fallback && ts.isBinaryExpression(fallback) && fallback.right === node
          && fallback.operatorToken.kind === ts.SyntaxKind.BarBarToken
          && fallback.left.getText(source) === 'import.meta.env.VITE_BUILD_ID'
          && property && ts.isPropertyAssignment(property) && property.initializer === fallback
          && ts.isIdentifier(property.name) && property.name.text === 'buildId'
          && options && ts.isObjectLiteralExpression(options)
          && call && ts.isCallExpression(call) && call.arguments[0] === options
          && ts.isIdentifier(call.expression) && factories.has(call.expression.text)
          && options.properties.some(item => ts.isPropertyAssignment(item) && ts.isIdentifier(item.name)
            && item.name.text === 'mode' && ts.isStringLiteral(item.initializer) && item.initializer.text === 'public')) {
          technical.push([node.getStart(source), node.end]);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    // Chỉ che literal kỹ thuật; chữ UI, comment và identifier cùng dòng vẫn được quét.
    for (const [start, end] of technical.sort((a, b) => b[0] - a[0])) {
      copy = copy.slice(0, start) + ' '.repeat(end - start) + copy.slice(end);
    }
  }
  const lower = copy.toLowerCase();
  return BANNED.filter(word => lower.includes(word));
}

describe('chữ hiển thị của web', () => {
  it('mã nguồn và trang HTML không chứa cụm bị cấm (trừ file test)', () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries({ ...SOURCES, ...PAGES })) {
      if (/\.test\.tsx?$/.test(path)) continue;
      for (const word of bannedCopy(path, text)) offenders.push(`${path}: ${word}`);
    }
    expect(offenders).toEqual([]);
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);   // bảo đảm glob không rỗng
  });

  it.each([
    "import { createTrafficTransport } from '../../../../shared/public-demo/traffic-transport.js';",
    "import type { TrafficTransport } from '../../../../shared/public-demo/traffic-transport.js';",
    "export { ApiError } from '../../../../shared/public-demo/traffic-transport.js';",
    "export type { TrafficTransport } from '../../../../shared/public-demo/traffic-transport.js';",
    "interface Snapshot { snapshot_version: 'public-demo-v1' }; type Version = 'public-demo-v1';",
    "import { createTrafficTransport } from '../../../../shared/public-demo/traffic-transport.js'; const transport = createTrafficTransport({ mode: 'public', buildId: import.meta.env.VITE_BUILD_ID || 'public-demo-v1' });",
  ])('chấp nhận đúng literal kỹ thuật trong AST: %s', source => {
    expect(bannedCopy('probe.ts', source)).toEqual([]);
  });

  it.each([
    "import { x } from '../../../../shared/public-demo/traffic-transport.js'; const label = 'demo';",
    "export { x } from '../../../../shared/public-demo/traffic-transport.js'; const label = 'demo';",
    "type Version = 'public-demo-v1'; const label = 'demo';",
    "const label = 'public-demo-v1';",
    "type Version = 'public-demo-v2';",
    "import { x } from '../../../../shared/public-demo/other.js';",
    "import { demo } from '../../../../shared/public-demo/traffic-transport.js';",
    "import { x } from '../../../../shared/public-demo/traffic-transport.js'; // demo",
    "element.textContent = 'public-demo-v1';",
    "const options = { buildId: import.meta.env.VITE_BUILD_ID || 'public-demo-v1' };",
    "import { createTrafficTransport } from '../../../../shared/public-demo/traffic-transport.js'; createTrafficTransport({ mode: 'public', label: import.meta.env.VITE_BUILD_ID || 'public-demo-v1' });",
    "import { createTrafficTransport } from '../../../../shared/public-demo/traffic-transport.js'; createTrafficTransport({ mode: 'public', buildId: import.meta.env.VITE_BUILD_ID || 'public-demo-v1' }); element.textContent = 'public-demo-v1';",
  ])('vẫn bắt chữ UI hoặc literal ngoài ngoại lệ: %s', source => {
    expect(bannedCopy('probe.ts', source)).toContain('demo');
  });

  it.each(BANNED)('giữ lệnh cấm chữ hiển thị: %s', word => {
    expect(bannedCopy('probe.tsx', `<span>${word}</span>`)).toContain(word);
    expect(bannedCopy('probe.css', `/* ${word} */`)).toContain(word);
    expect(bannedCopy('probe.html', `<p>${word}</p>`)).toContain(word);
  });
});
