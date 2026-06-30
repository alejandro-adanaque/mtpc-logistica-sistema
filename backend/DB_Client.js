/**
 * DB_CLIENT.gs
 * CLIENTE DE BASE DE DATOS (SUPABASE REST API)
 */

// ==========================================
// MÉTODOS PÚBLICOS (INTERFAZ)
// ==========================================

function dbSelect(tabla, columnas = '*', filtro = '', opciones = null) {
  // CONFIGURACIÓN INICIAL
  let rangeHeader = null;
  
  // DETECCIÓN DE MODO: ¿Es una llamada nueva con paginación?
  // Verificamos si 'opciones' es un objeto y tiene la propiedad 'pagina'
  if (opciones && typeof opciones === 'object' && opciones.pagina) {
    const size = opciones.tamano || 10;
    const inicio = (opciones.pagina - 1) * size;
    const fin = inicio + size - 1;
    rangeHeader = `${inicio}-${fin}`;
  } 
  // COMPATIBILIDAD LEGACY: Si 'opciones' es string (antiguos filtros extra), lo unimos al filtro
  else if (typeof opciones === 'string') {
    filtro += opciones; 
  }

  // Lógica de construcción de URL (Igual que tenías, pero limpia)
  let queryParams = `?select=${columnas}`;
  
  // Limpieza de filtros duplicados '&' o '?'
  if (filtro) {
    const limpio = filtro.startsWith('&') || filtro.startsWith('?') ? filtro.substring(1) : filtro;
    queryParams += `&${limpio}`;
  }

  return _request('GET', `/${tabla}${queryParams}`, null, rangeHeader);
}

function dbInsert(tabla, datos) {
  const endpoint = `/${tabla}`;
  return _request('POST', endpoint, datos);
}

function dbUpdate(tabla, datos, condicion) {
  if (!condicion) throw new Error("Se requiere una condición para actualizar (ej: id=eq.X)");
  const endpoint = `/${tabla}?${condicion}`;
  return _request('PATCH', endpoint, datos);
}

function dbDelete(tabla, condicion) {
  if (!condicion) throw new Error("Se requiere una condición para eliminar");
  const endpoint = `/${tabla}?${condicion}`;
  return _request('DELETE', endpoint);
}

// ==========================================
// NÚCLEO PRIVADO
// ==========================================

function _request(method, endpoint, payload, rangeHeader) {
  const url = CONFIG.SUPABASE_URL + '/rest/v1' + endpoint;
  const headers = {
    'apikey': CONFIG.SUPABASE_KEY,
    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': rangeHeader ? 'count=exact' : 'return=representation'
  };

  if (rangeHeader) headers['Range'] = rangeHeader;

  const params = {
    method: method,
    headers: headers,
    muteHttpExceptions: true
  };
  
  if (payload) params.payload = JSON.stringify(payload);

  const response = UrlFetchApp.fetch(url, params);
  const code = response.getResponseCode();
  const content = response.getContentText();

  if (code >= 400) return { exito: false, error: content };

  const data = JSON.parse(content);
  
  if (rangeHeader) {
    const contentRange = response.getHeaders()['Content-Range'];
    const total = contentRange ? parseInt(contentRange.split('/')[1]) : data.length;
    return { exito: true, datos: data, total: total };
  }
  
  return { exito: true, datos: data };
}