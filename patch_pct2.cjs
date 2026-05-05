const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
code = code.replace(
  `  // Progress: 12.5% per assigned worker (4 stages) and 12.5% per completed stage (4 stages)
  let points = 0;
  if (row.cutter) points++; if (row.cutDone) points++;
  if (row.tailor) points++; if (row.tailorDone) points++;
  if (row.prep) points++; if (row.prepDone) points++;
  if (row.assembler) points++; if (row.assembleDone) points++;
  const pct = Math.round((points / 8) * 100);`,
  `  // Progress: 25% per completed stage (4 stages)
  let completedStages = 0;
  if (row.cutDone) completedStages++;
  if (row.tailorDone) completedStages++;
  if (row.prepDone) completedStages++;
  if (row.assembleDone) completedStages++;
  const pct = Math.round((completedStages / 4) * 100);`
);
code = code.replace(
  'const strokeColor = pct === 100 ? "#10b981" : pct >= 75 ? "#84cc16" : pct >= 50 ? "#eab308" : "#f97316";',
  'const strokeColor = row.done ? "#10b981" : (pct >= 75 ? "#84cc16" : pct >= 50 ? "#eab308" : "#f97316");'
);
fs.writeFileSync('src/App.jsx', code);