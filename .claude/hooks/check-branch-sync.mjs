/**
 * PreToolUse — blocks a commit or push when the branch is behind its upstream.
 * Diverged branches get a different message, since `git pull` is the wrong fix.
 */
import { execSync } from 'node:child_process';

const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

const deny = (reason) =>
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  try {
    if (!/\bgit\s+(commit|push)\b/.test(JSON.parse(raw)?.tool_input?.command ?? '')) return;
  } catch {
    return;
  }

  if (git('rev-parse --abbrev-ref --symbolic-full-name @{u}') === null) return;
  git('fetch --quiet');

  const counts = git('rev-list --left-right --count @{u}...HEAD');
  if (counts === null) return;

  const [behind, ahead] = counts.split(/\s+/).map(Number);
  if (!behind) return;

  deny(
    ahead
      ? `Branch has diverged: ${behind} commit(s) on the remote, ${ahead} local. Rebuild your work on top of the remote version rather than merging over it.`
      : `Branch is ${behind} commit(s) behind upstream. Run \`git pull\` first.`,
  );
});
