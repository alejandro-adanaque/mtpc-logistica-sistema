/**
 * SERVICIO: INVENTARIO (V3.1)
 * Gestión de productos, stock, ubicaciones y trazabilidad.
 */

// ==========================================
// 1. LISTADO, FILTROS Y PAGINACIÓN
// ==========================================

function srvListarProductos(pagina, tamano, busqueda, filtros) {
  try {
    let queryFiltros = "&order=id.desc"; 
    
    if (busqueda && busqueda.trim() !== '') {
      const texto = busqueda.trim();
      queryFiltros += `&or=(nombre.ilike.*${texto}*,sku.ilike.*${texto}*)`;
    }
    
    if (filtros) {
      if (filtros.categoria && filtros.categoria !== "") queryFiltros += `&categoria_id=eq.${filtros.categoria}`;
      if (filtros.marca && filtros.marca !== "") queryFiltros += `&marca=eq.${filtros.marca}`;
    }

    // CAMBIO: Añadimos 'tiene_igv' a la lista de columnas para el frontend
    const columnas = 'id, sku, nombre, stock_actual, precio_venta_sugerido, precio_costo_promedio, categoria_id, subcategoria_id, marca, modelo, especificaciones, ubicacion_id, stock_minimo, tipo_producto, tiene_igv';
    
    const respuesta = dbSelect('productos', columnas, queryFiltros, { pagina: pagina, tamano: tamano });

    if (!respuesta.exito) throw new Error(respuesta.error);

    return {
      exito: true,
      datos: respuesta.datos,
      paginacion: {
        totalRegistros: respuesta.total,
        paginaActual: pagina,
        itemsPorPagina: tamano,
        totalPaginas: Math.ceil(respuesta.total / tamano)
      }
    };
  } catch (e) {
    return { exito: false, error: e.toString() };
  }
}
// ==========================================
// 2. OPERACIONES CRUD DE PRODUCTOS
// ==========================================

function registrarProducto(datos) {
  try {
    // A. Generar SKU automático
    const resLast = dbSelect('productos', 'sku', '&limit=1&order=id.desc');
    let siguienteNumero = 1;

    if (resLast.exito && resLast.datos.length > 0) {
        const ultimoSku = resLast.datos[0].sku;
        if (ultimoSku && ultimoSku.includes('-')) {
            const partes = ultimoSku.split('-');
            const numeroActual = parseInt(partes[partes.length - 1]);
            if (!isNaN(numeroActual)) siguienteNumero = numeroActual + 1;
        }
    }
    datos.sku = `PROD-${siguienteNumero.toString().padStart(5, '0')}`;

    // B. Saneamiento de Datos (Type Casting)
    if (datos.categoria_id) datos.categoria_id = parseInt(datos.categoria_id);
    if (datos.subcategoria_id) datos.subcategoria_id = parseInt(datos.subcategoria_id) || null;
    if (datos.ubicacion_id) datos.ubicacion_id = parseInt(datos.ubicacion_id) || null;
    
    // CAMBIO: Asegurar que tiene_igv sea booleano
    datos.tiene_igv = datos.hasOwnProperty('tiene_igv') ? Boolean(datos.tiene_igv) : true;
    
    datos.precio_costo_promedio = parseFloat(datos.precio_costo_promedio) || 0;
    datos.precio_venta_sugerido = parseFloat(datos.precio_venta_sugerido) || 0;
    datos.stock_minimo = parseInt(datos.stock_minimo) || 0;
    datos.stock_actual = 0; 

    const res = dbInsert('productos', datos);
    return res.exito ? { exito: true, sku: datos.sku } : { exito: false, error: res.error };
  } catch (e) { return { exito: false, error: e.toString() }; }
}

function actualizarProductoBackend(id, datos) {
  try {
    delete datos.sku; 
    delete datos.stock_actual; 

    // Saneamiento de Datos
    if (datos.categoria_id) datos.categoria_id = parseInt(datos.categoria_id);
    if (datos.subcategoria_id) datos.subcategoria_id = parseInt(datos.subcategoria_id) || null;
    if (datos.ubicacion_id) datos.ubicacion_id = parseInt(datos.ubicacion_id) || null;
    
    // CAMBIO: Asegurar que tiene_igv sea booleano en la actualización
    if (datos.hasOwnProperty('tiene_igv')) datos.tiene_igv = Boolean(datos.tiene_igv);
    
    datos.precio_costo_promedio = parseFloat(datos.precio_costo_promedio) || 0;
    datos.precio_venta_sugerido = parseFloat(datos.precio_venta_sugerido) || 0;
    datos.stock_minimo = parseInt(datos.stock_minimo) || 0;

    const res = dbUpdate('productos', datos, `&id=eq.${id}`);
    return res.exito ? { exito: true } : { exito: false, error: res.error };
  } catch (e) { return { exito: false, error: e.toString() }; }
}

function eliminarProductoBackend(id) {
  try {
    const res = dbDelete('productos', `&id=eq.${id}`);
    if (res.exito) return { exito: true };
    
    if (res.error && res.error.includes('foreign key constraint')) {
        return { exito: false, error: 'No se puede eliminar: El producto tiene movimientos o lotes asociados.' };
    }
    return { exito: false, error: res.error };
  } catch (e) { return { exito: false, error: e.toString() }; }
}

// ==========================================
// 3. CARGA MAESTRA (OPTIMIZADA V2.1)
// ==========================================

/**
 * Obtiene productos, categorías, subcategorías y UBICACIONES en un solo viaje.
 */
function srvObtenerInventarioCompleto() {
  try {
    const p = dbSelect('productos', '*', '&order=id.desc');
    const c = dbSelect('categorias', 'id, nombre', '&tipo=eq.PRODUCTO');
    const s = dbSelect('subcategorias', 'id, nombre, categoria_id');
    const u = dbSelect('ubicaciones', 'id, nombre'); // <--- NUEVA CARGA DE UBICACIONES

    return {
      exito: true,
      datos: {
        productos: p.exito ? p.datos : [],
        categorias: c.exito ? c.datos : [],
        subcategorias: s.exito ? s.datos : [],
        ubicaciones: u.exito ? u.datos : [] // <--- SE ENVÍA AL FRONTEND
      }
    };
  } catch (e) {
    return { exito: false, error: e.toString() };
  }
}

// ==========================================
// 4. UTILIDADES DE STOCK Y LICENCIAS
// ==========================================

function moverStock(prodId, cantidad) {
    const res = dbSelect('productos', 'stock_actual', `&id=eq.${prodId}`);
    if(res.exito && res.datos.length > 0) {
        const nuevo = (res.datos[0].stock_actual || 0) + parseInt(cantidad);
        dbUpdate('productos', { stock_actual: nuevo }, `&id=eq.${prodId}`);
    }
}

function moverStockBackend(prodId, cantidad) {
  try {
    moverStock(prodId, cantidad); 
    return { exito: true };
  } catch (e) { return { exito: false, error: e.toString() }; }
}

function guardarLoteLicencias(listaClaves) {
  try {
    for(let lic of listaClaves) {
        if(!lic.producto_id) continue;
        dbInsert('inventario_lotes', {
          producto_id: parseInt(lic.producto_id),
          diferenciador: lic.key, 
          stock_inicial: parseInt(lic.capacidad) || 1,
          stock_actual: parseInt(lic.capacidad) || 1,
          fecha_vencimiento: lic.fin || null,
          activo: true 
        });
    }
    return { exito: true };
  } catch (e) { return { exito: false, error: e.toString() }; }
}
