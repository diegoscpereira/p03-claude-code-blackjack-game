/**
 * PostToolUse — when a brand-new source file appears under src/ or api/, remind
 * the agent that this project builds spec-first. Injects context, never blocks.
 */
import { execSync } from 'node:child_process';

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let filePath = '';
  try {
    const payload = JSON.parse(raw);
    filePath = payload?.tool_input?.file_path ?? payload?.tool_response?.filePath ?? '';
  } catch {
    return;
  }

  const rel = filePath.replace(/\\/g, '/');
  if (!/\/(src|api)\/.*\.(ts|tsx)$/.test(rel) || /\.test\.tsx?$/.test(rel)) return;

  // Only fire for files git has never seen — an edit to existing code is fine.
  try {
    execSync(`git ls-files --error-unmatch "${filePath}"`, { stdio: 'ignore' });
    return;
  } catch {
    /* untracked — fall through */
  }

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          'New source file created. This project is spec-driven: it should map to a task in ' +
          'specs/*/tasks.md, and the constitution requires its test to be written and observed ' +
          'failing first. If this is new feature work, run /speckit-specify rather than ' +
          'implementing straight into src/.',
      },
    }),
  );
});
