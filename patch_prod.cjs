const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Add Search State to ProductionTab
c = c.replace('function ProductionTab({ data, setData, dark, user }) {', 'function ProductionTab({ data, setData, dark, user }) {\n  const [search, setSearch] = useState("");');

// 2. Add Search Input to ProductionTab UI
c = c.replace('<div className="flex gap-1.5 flex-wrap">', '<div className="relative mb-2"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente ou brinquedo..." className={`w-full pl-9 pr-4 py-2 rounded-xl border text-xs outline-none ${dark ? "bg-gray-900 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"}`} /></div><div className="flex gap-1.5 flex-wrap">');

// 3. Filter Production rows by search
c = c.replace('const activeRows = sortedRows.filter(r => !r.done && r.status !== "concluido");', 'const activeRows = sortedRows.filter(r => !r.done && r.status !== "concluido" && (r.clientName?.toLowerCase().includes(search.toLowerCase()) || r.toy?.toLowerCase().includes(search.toLowerCase()) || r._orderId?.includes(search)));');

// 4. Improve State Mapping in RoutesTab
c = c.replace('if(!str) return "SP";', 'if(!str || str.length < 2) return "SP";');

// 5. Fix Dashboard Calendar - Make it show real days
c = c.replace('Array.from({ length: new Date(year, TODAY.getMonth(), 1).getDay() }).map', 'Array.from({ length: new Date(year, new Date().getMonth(), 1).getDay() }).map');

fs.writeFileSync('src/App.jsx', c);
