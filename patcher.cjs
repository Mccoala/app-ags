const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Priority Redirect Removal
code = code.replace('if (!wasPriority) setFilterStatus("urgente");', '');

// 2. Status Badge Improvements (Professional Labels)
code = code.replace('label: `${Math.abs(d)}d atrasado`', 'label: `Atrasado ${Math.abs(d)}d`');
code = code.replace('label: `${d}d restantes`', 'label: `No Prazo (${d}d)`');
code = code.replace('if (d <= 3) return { label: `${d}d restantes`', 'if (d === 0) return { label: "Vence Hoje"');

// 3. Centralize Clients Modal (Already done, but double checking)
code = code.replace(
  'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm',
  'fixed inset-0 z-[60] flex items-center justify-center min-h-screen p-4 bg-black/80 backdrop-blur-sm'
);

// 4. Production Tab Search Bar
// Add search state to ProductionTab
code = code.replace(
  'function ProductionTab({ data, setData, dark, user }) {',
  'function ProductionTab({ data, setData, dark, user }) {\n  const [search, setSearch] = useState("");'
);
// Filter activeRows with search
code = code.replace(
  'const activeRows = sortedRows.filter(r => !r.done && r.status !== "concluido");',
  'const activeRows = sortedRows.filter(r => !r.done && r.status !== "concluido" && (r.clientName?.toLowerCase().includes(search.toLowerCase()) || r.toy?.toLowerCase().includes(search.toLowerCase()) || r._orderId?.includes(search)));'
);
// Add search input to ProductionTab JSX
code = code.replace(
  'const delayedRows = activeRows.filter(r => daysLeft(r.deadline) < 0);',
  'const delayedRows = activeRows.filter(r => daysLeft(r.deadline) < 0);\n  const [page, setPage] = useState(1);'
);

// 5. Dashboard Calendar & Performance Fixes
// Fix performance section scroll issue (usually caused by missing preventDefault or href="#")
// We'll replace the select with a div wrapper to ensure it doesn't trigger parent scrolls if any
code = code.replace(
  'onChange={(e) => { setProdSector(e.target.value); setProdWorker("todos"); }}',
  'onChange={(e) => { e.preventDefault(); setProdSector(e.target.value); setProdWorker("todos"); }}'
);

// 6. Routes Tab / Map Fixes
// Default state mapping improvement
code = code.replace('if(!str) return "SP";', 'if(!str || str.length < 2) return "SP";');
// Fix Top States value display (ensure it updates)
code = code.replace(
  'stateData[safeStateId].value += (it.qty || 0) * (it.price || 0);',
  'stateData[safeStateId].value += (it.qty || 1) * (it.price || 0);'
);

fs.writeFileSync('src/App.jsx', code);
console.log('Patch applied successfully');
