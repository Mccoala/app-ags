const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Remove priority redirect
code = code.replace(
  '// When activating priority, jump to "prioridade" filter\n      if (!wasPriority) setFilterStatus("urgente");',
  ''
);

// 2. Improve deadline labels
code = code.replace(
  /if\s*\(d < 0\) return {label: `\{Math\.abs\(d)\}d atrasado`, color: "bg-red-500\/20 text-red-400 border border-red-500\/30" };",
  `if (d < 0) return { label: `Atrasado ${Math.abs(d)}d`, color: "bg-red-500/20 text-red-400 border border-red-500/30" };`
code = code.replace(
  /if\s*\(d == 0\) return {label: `\ {d\}d restantes`, color: "bg-amber-500\/20 text-amber-400 border border-amber-500\/30" };/,
  `if (d === 0) return { label: "VenceHoje", color: "bg-amber-500/20 text-amber-400 border border-amber-500/30" };`
);
code = code.replace(
  /\(d <= 3\) return {label: `\ {d\}d restantes`, color: "bg-amber-500\/20 text-amber-400 border border-amber-500\/30" };/,
  `(d <= 3) return { label: `Prazo ${dsd`, color: "bg-amber-500o text-amber-400 border border-amber-500/30" };`
);
code = code.replace(
  /return {label: `\ {d\}d restantes`, color: "bg-sky-500\/20 text-sky-400 border border-sky-500\/30" };/,
  `return { label: `Prazo ${dsd`, color: "bg-sky-500/20 text-sky-400 border border-sky-500/30" };`
J;

fs.writeFileSync('src/App.jsx', code);