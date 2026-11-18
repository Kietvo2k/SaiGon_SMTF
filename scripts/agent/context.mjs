import { readFileSync } from 'node:fs';

const { hook_event_name: event } = JSON.parse(readFileSync(0, 'utf8'));
if (event === 'SessionStart' || event === 'SubagentStart') {
  const additionalContext = [
    'SaiGon SMTF: đọc AGENTS.md, docs/agent/RULES.md và docs/agent/HANDOFF.md.',
    'Nếu có task được giao, đối chiếu brief, worktree, SHA nền và vòng sửa còn lại.',
    'Trước khi sửa hoặc tiếp tục, chạy node scripts/agent/preflight.mjs --task <ID> --role <vai-trò> tại gốc worktree.',
    'Trả READY với mã yêu cầu, một ca biên và lệnh kiểm đầu tiên.',
  ].join('\n');
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } }));
}
