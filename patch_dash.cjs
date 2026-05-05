const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Add interactive Month/Year to Dashboard Calendar
c = c.replace('const [calDate, setCalDate] = useState(null);', 'const [calDate, setCalDate] = useState(null);\n  const [calMonth, setCalMonth] = useState(TODAY.getMonth());\n  const [calYear, setCalYear] = useState(TODAY.getFullYear());');
c = c.replace('const year = TODAY.getFullYear();', 'const year = calYear;');
c = c.replace('const month = String(TODAY.getMonth() + 1).padStart(2, \'0\');', 'const month = String(calMonth + 1).padStart(2, \'0\');');
c = c.replace('const daysInMonth = new Date(year, TODAY.getMonth() + 1, 0).getDate();', 'const daysInMonth = new Date(year, calMonth + 1, 0).getDate();');

// 2. Add Month/Year selectors to Dashboard
const monthSelect = `
          <div className="flex gap-2">
            <select value={calMonth} onChange={e => setCalMonth(parseInt(e.target.value))} className="bg-transparent border-none text-xs font-bold outline-none cursor-pointer">
              {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <select value={calYear} onChange={e => setCalYear(parseInt(e.target.value))} className="bg-transparent border-none text-xs font-bold outline-none cursor-pointer">
              {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>`;
c = c.replace('Calendário de Metas ({new Date().toLocaleString("pt-BR", { month: "long", year: "numeric" })})', 'Calendário de Metas');
c = c.replace('</h3>', '</h3>' + monthSelect);

// 3. Fix Calendar logic to use selected Month/Year
c = c.replace('new Date(year, new Date().getMonth(), 1).getDay()', 'new Date(year, calMonth, 1).getDay()');

fs.writeFileSync('src/App.jsx', c);
