// Estados do Brasil: siglas, nomes e centro aproximado de cada estado
export const STATE_COORDS = {
  'AC': [-70.5, -9.0], 'AL': [-36.5, -9.6], 'AM': [-64.0, -3.4], 'AP': [-51.0, 1.4],
  'BA': [-41.7, -12.5], 'CE': [-39.5, -5.2], 'DF': [-47.9, -15.8], 'ES': [-40.3, -19.1],
  'GO': [-49.3, -15.9], 'MA': [-45.2, -5.4], 'MG': [-44.5, -18.5], 'MS': [-54.6, -20.4],
  'MT': [-55.9, -12.6], 'PA': [-52.3, -3.9], 'PB': [-36.7, -7.1], 'PE': [-37.9, -8.3],
  'PI': [-42.7, -7.6], 'PR': [-51.6, -24.8], 'RJ': [-43.2, -22.9], 'RN': [-36.5, -5.8],
  'RO': [-63.0, -10.8], 'RR': [-61.3, 1.9], 'RS': [-53.8, -30.0], 'SC': [-50.9, -27.2],
  'SE': [-37.1, -10.6], 'SP': [-48.6, -23.5], 'TO': [-48.3, -10.2]
};

export const UF_MAP = {
  'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARA': 'CE', 'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES', 'GOIAS': 'GO', 'MARANHAO': 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG', 'PARA': 'PA', 'PARAIBA': 'PB', 'PARANA': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI',
  'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', 'RONDONIA': 'RO',
  'RORAIMA': 'RR', 'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO'
};

export const UF_NAMES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba',
  PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};

// Aceita "SP", "sp", "São Paulo", "Sao Paulo/SP", "Campinas - SP"... devolve a sigla ou "" se não reconhecer
export function normalizeState(s) {
  if (!s) return '';
  const clean = String(s).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (STATE_COORDS[clean]) return clean;
  if (UF_MAP[clean]) return UF_MAP[clean];
  const tail = clean.match(/(?:^|[\s\/\-,(])([A-Z]{2})\)?\s*$/);
  if (tail && STATE_COORDS[tail[1]]) return tail[1];
  const byName = Object.keys(UF_MAP).sort((a, b) => b.length - a.length).find(n => clean.includes(n));
  return byName ? UF_MAP[byName] : '';
}
export const clientUF = (client) => normalizeState(client?.state) || normalizeState(client?.city);

