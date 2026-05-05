const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
code = code.replace(
  '<button\n            onClick={() => setDark(!dark)}',
  `<button
            onClick={() => setShowPlans(true)}
            className="sidebar-item"
            style={!sidebarOpen ? { justifyContent:"center",padding:"10px 0" } : {}}
            title={!sidebarOpen ? "Planos" : undefined}
          >
            <Star size={17} style={{ flexShrink:0,opacity:0.7,color:"#eab308" }} />
            {sidebarOpen && <span style={{ fontSize:"0.875rem",fontWeight:600 }}>Planos</span> }
          </button>
          <button
            onClick={() => setDark(!dark)}`
);
fs.writeFileSync('src/App.jsx', code);