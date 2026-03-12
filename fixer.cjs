const { buildSync } = require('esbuild');
const fs = require('fs');

let file = 'src/App.jsx';

for(let i=0; i<300; i++) {
   let content = fs.readFileSync(file, 'utf8');
   let lines = content.split('\n');
   try {
       buildSync({
           entryPoints: [file],
           bundle: false,
           outfile: 'temp.js',
           logLevel: 'silent',
           loader: { '.jsx': 'jsx' }
       });
       console.log("Success! Fixed all errors.");
       if (fs.existsSync('temp.js')) fs.unlinkSync('temp.js');
       break;
   } catch(e) {
       if (!e.errors || e.errors.length === 0) {
           console.log(e);
           break;
       }
       let msg = e.errors[0];
       if (!msg.location) {
           console.log("No location", msg);
           break;
       }
       let lineIdx = msg.location.line - 1;
       console.log("Fixing line", lineIdx+1, msg.text);
       
       // Just merge the line with the next one
       let currentLine = lines[lineIdx].replace(/\r$/, '');
       let nextLine = lines[lineIdx+1] ? lines[lineIdx+1].trimStart() : "";
       
       let joiner = '';
       let lastChar = currentLine.slice(-1);
       if (lastChar.match(/[a-zA-Z0-9\u00C0-\u00FF]/)) {
          joiner = ' ';
       }
       
       lines[lineIdx] = currentLine + joiner + nextLine;
       lines.splice(lineIdx + 1, 1);
       fs.writeFileSync(file, lines.join('\n'));
   }
}
