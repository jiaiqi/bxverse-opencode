const fs = require('fs');
const c = fs.readFileSync('G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html', 'utf8');
const start = c.indexOf('<div id="app"');
const open = c.indexOf('>', start) + 1;
const scriptPos = c.indexOf('<script>', open);
const end = c.lastIndexOf('</div>', scriptPos);
const tpl = c.slice(open, end);
const { compile } = require('G:/vibecoding/bxverse-opencode/node_modules/.pnpm/@vue+compiler-dom@3.5.41/node_modules/@vue/compiler-dom');
let failed = false;
try {
  compile(tpl, {
    onError(e) {
      failed = true;
      console.log('ERR code', e.code, '|', e.message);
      if (e.loc) {
        const ls = tpl.slice(0, e.loc.start.offset).split('\n');
        console.log('at line', ls.length, 'col', e.loc.start.column);
        console.log('>>', ls[ls.length - 1].slice(0, 200));
      }
    },
  });
} catch (e) {
  console.log('THROWN', e.code, e.message);
  if (e.loc) {
    const ls = tpl.slice(0, e.loc.start.offset).split('\n');
    console.log('at line', ls.length, 'col', e.loc.start.column);
    console.log('>>', ls[ls.length - 1].slice(0, 200));
  }
}
if (!failed) console.log('COMPILE OK');
