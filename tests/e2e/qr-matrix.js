// Uses the APP'S OWN qrcode generator (docs/vendor/qrcode.js) to produce the matrix for a token.
const vm = require('vm'), fs = require('fs'), path = require('path');
const ctx = { module: undefined, exports: undefined, define: undefined }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'vendor', 'qrcode.js'), 'utf8') + ';this.qrcode=qrcode;', ctx);
const q = ctx.qrcode(0, 'M'); q.addData(process.argv[2]); q.make(); const n = q.getModuleCount();
console.log(JSON.stringify(Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c) ? 1 : 0))));
