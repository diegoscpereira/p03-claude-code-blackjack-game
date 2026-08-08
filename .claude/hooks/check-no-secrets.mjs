/**
 * PreToolUse — blocks a push whose outgoing commits contain a JWT-shaped string
 * or a stray .env file. The patterns are narrow on purpose: matching bare
 * `service_role` would fire on scripts/check-bundle.ts, which hunts for it.
 */
import { execSync } from 'node:child_process';

const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
const ENV_FILE = /^\+\+\+ b\/(?!\.env\.example)(.*\.env(\..+)?)$/m;

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
    const command = JSON.parse(raw)?.tool_input?.command ?? '';
    if (!/\bgit\s+push\b/.test(command)) return;
  } catch {
    return;
  }

  // What this push would actually send, falling back to the last commit when
  // there is no upstream yet. Shell redirection is avoided deliberately:
  // `execSync` runs through cmd.exe on Windows, where `2>/dev/null` is not a
  // valid path and leaks an error line into the transcript.
  const gitDiff = (range) => {
    try {
      return execSync(`git diff ${range}`, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return null;
    }
  };

  const diff = gitDiff('@{u}..HEAD') ?? gitDiff('HEAD~1..HEAD');
  if (diff === null) return; // Nothing to compare — let the push proceed.

  if (JWT.test(diff)) {
    return deny(
      'This push contains something shaped like a JWT — likely a Supabase service_role key. ' +
        'Credentials belong only in server-side environment configuration (ADR 0002). ' +
        'Remove it, rotate the key, and rewrite the commit before pushing.',
    );
  }

  const envFile = diff.match(ENV_FILE);
  if (envFile) {
    return deny(
      `This push adds ${envFile[1]}, which is meant to be gitignored. ` +
        'Only .env.example belongs in the repository.',
    );
  }
});
