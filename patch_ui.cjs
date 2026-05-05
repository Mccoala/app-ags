const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');
c = c.replace('if (!wasPriority) setFilterStatus("urgente");', '');
c = c.split('${Math.abs(d)}d atrasado').join('Atrasado ${Math.abs(d)}d');
c = c.split('${d}d restantes').join('No Prazo (${d}d)');
fs.writeFileSync('src/App.jsx', c);
