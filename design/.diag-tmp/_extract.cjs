const fs = require('fs');
const c = fs.readFileSync('G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html', 'utf8');
const s = c.indexOf('<script>', c.indexOf('<div id="app"')) + 8;
const e = c.lastIndexOf('</' + 'script>');
fs.writeFileSync('G:/vibecoding/bxverse-opencode/design/_app-extract.js', c.slice(s, e), 'utf8');
console.log('extracted', e - s, 'bytes');
