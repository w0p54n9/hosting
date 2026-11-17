// Force a clean restart of the app on cPanel/LiteSpeed.
//
// Run it from cPanel → Setup Node.js App → (edit app) → "Run JS script" → restart-server.
// It stops any running copy of this app's server process (LiteSpeed's "lsnode"),
// so the web server starts a fresh one on the next visit. It writes what it did to
// restart-log.txt in the app folder.

const { execSync } = require('child_process');
const fs = require('fs');

const keep = new Set([process.pid, process.ppid]);
let listing = '';
try {
  listing = execSync('ps -u "$(id -un)" -o pid=,ppid=,args=', { encoding: 'utf8' });
} catch (err) {
  listing = 'ps failed: ' + err.message;
}

const stopped = [];
for (const line of listing.split('\n')) {
  const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
  if (!m) continue;
  const pid = Number(m[1]);
  const args = m[3];
  if (keep.has(pid)) continue;
  if (!/lsnode/.test(args)) continue; // only the web server's Node.js app processes
  try {
    process.kill(pid, 'SIGTERM');
    stopped.push(`${pid}  ${args}`);
  } catch (err) {
    stopped.push(`could not stop ${pid}: ${err.message}`);
  }
}

const report = [
  new Date().toISOString(),
  'Processes:',
  listing.trim(),
  '',
  stopped.length ? 'Stopped:' : 'Nothing to stop (no lsnode processes found).',
  ...stopped,
  '',
].join('\n');

try {
  fs.writeFileSync(__dirname + '/restart-log.txt', report);
} catch {
  /* ignore */
}
console.log(report);
