// Checks WCAG contrast of the page palette in all eight lights states (0..7
// PRs merged), read from src/design/tokens.css, plus the fixed console colors.
// Run: npm run contrast   (exits 1 if anything drops below 4.5:1)
import { contrast, lightStates, over, LIGHTS_ON_AT } from './palette.mjs';

const MIN = 4.5;
let failed = false;
const row = (label, pairs) => {
  const ratios = Object.entries(pairs).map(([k, [a, b]]) => [k, contrast(a, b)]);
  const bad = ratios.some(([, r]) => r < MIN);
  failed ||= bad;
  console.log(`${label}   ${ratios.map(([k, r]) => `${k} ${r.toFixed(2)}`).join('   ')}${bad ? '   FAIL' : ''}`);
};

const { states, base } = lightStates();
console.log('Page, per lights state (merged after #1):');
for (const s of states) {
  const tag = s.level === LIGHTS_ON_AT ? ' lights on' : s.level < LIGHTS_ON_AT ? ' ink     ' : ' paper   ';
  row(`  ${s.level}${tag} bg ${s.bg}`, { fg: [s.fg, s.bg], muted: [s.muted, s.bg], link: [s.agentText, s.bg] });
}

// Console surfaces stay ink at every state.
const consoleBg = base['--console-bg'];
const panel = '#0c0b09'; // .pr-panel
const diffLine = over('#2fa36b', 0.055, panel); // .diff-line tint
console.log('Console (fixed):');
row('  console', {
  fg: [base['--console-fg'], consoleBg],
  muted: [base['--console-muted'], consoleBg],
  'log time': [base['--console-dim'], consoleBg],
  'diff n': [base['--console-dim'], diffLine],
  comment: [base['--syn-comment'], diffLine],
  agent: [base['--console-agent'], consoleBg],
});
process.exit(failed ? 1 : 0);
