/**
 * SERVICIO: MAESTROS Y CONFIGURACIÓN (V2 - OPTIMIZADO)
 * Responsabilidad: Gestionar datos estáticos del sistema con Caché Inteligente.
 */

// Clave única para la memoria caché de este módulo
const CACHE_KEY_MAESTROS = "config_maestros_full_v2";

/**
 * 1. LECTURA OPTIMIZADA (Cache-Aside Pattern)
 * Intenta leer de memoria RAM primero. Si no existe, va a la Base de Datos.
 */
function srvCargarMaestros() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedData = cache.get(CACHE_KEY_MAESTROS);

    // A. ACIERTO DE CACHÉ (Cache Hit): Retornamos memoria (0.1s)
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // B. FALLO DE CACHÉ (Cache Miss): Vamos a Supabase (1.5s)
    // Traemos categorías activas. El JS decide si es 'PRODUCTO' o 'EMPRESA'
    const cats = dbSelect('categorias', 'id, nombre, tipo, activo', '&activo=eq.true&order=nombre.asc');
    const subs = dbSelect('subcategorias', '*', '&activo=eq.true&order=nombre.asc');
    const ubics = dbSelect('ubicaciones', '*', '&order=nombre.asc');
    const cuentas = dbSelect('cuentas_pago', '*', '&activo=eq.true&order=nombre.asc');
    
    const respuesta = {
      exito: true,
      datos: {
        categorias: cats.exito ? cats.datos : [],
        subcategorias: subs.exito ? subs.datos : [],
        ubicaciones: ubics.exito ? ubics.datos : [],
        cuentas: cuentas.exito ? cuentas.datos : []
      }
    };

    // C. GUARDADO EN CACHÉ (TTL: 30 minutos = 1800 seg)
    // Solo guardamos si la lectura de DB fue exitosa
    if (respuesta.exito) {
        cache.put(CACHE_KEY_MAESTROS, JSON.stringify(respuesta), 1800);
    }

    return respuesta;

  } catch (e) {
    return { exito: false, error: e.toString() };
  }
}

/**
 * 2. ESCRITURA CON INVALIDACIÓN (Cache Invalidation)
 * Guarda el dato en Supabase y BORRA la memoria para forzar una recarga fresca.
 */
function srvGuardarMaestro(tabla, datos, id = null) {
  try {
    let resultado;

    // ... (validaciones y lógica de insert/update igual que antes) ...
    if (id) {
      resultado = dbUpdate(tabla, datos, `&id=eq.${id}`);
    } else {
      resultado = dbInsert(tabla, datos);
    }

    // === AQUÍ ESTÁ EL ARREGLO ===
    if (resultado.exito) {
        const cache = CacheService.getScriptCache();
        
        // 1. Borra la caché general de configuración
        cache.remove(CACHE_KEY_MAESTROS);
        
        // 2. Borra la caché de Inventario (por si es categoría de producto)
        cache.remove("maestros_inv_v2");
        
        // 3. NUEVO: Borra la caché específica de Proveedores
        cache.remove("maestros_cat_prov"); 
    }

    return resultado;

  } catch (e) {
    return { exito: false, error: e.toString() };
  }
}

/**
 * 3. ELIMINACIÓN SEGURA
 */
function srvEliminarMaestro(tabla, id) {
  try {
    // Intento 1: Borrado Físico
    const res = dbDelete(tabla, `&id=eq.${id}`);
    
    // Intento 2: Si falla por FK (tiene productos asociados), hacemos "Soft Delete" (Desactivar)
    if (!res.exito && res.error && res.error.includes('foreign key')) {
       // Solo si la tabla tiene columna 'activo'
       if (['categorias', 'subcategorias', 'cuentas_pago'].includes(tabla)) {
         const resUpd = dbUpdate(tabla, { activo: false }, `&id=eq.${id}`);
         
         if (resUpd.exito) {
             CacheService.getScriptCache().remove(CACHE_KEY_MAESTROS); // Invalidar caché
             CacheService.getScriptCache().remove("maestros_inv_v2");
             return { exito: true, mensaje: "El elemento tenía datos. Se ha desactivado en lugar de borrar." };
         }
       }
       return { exito: false, error: "No se puede eliminar: El elemento está en uso." };
    }
    
    // Si borró físico, limpiamos caché
    if (res.exito) {
        CacheService.getScriptCache().remove(CACHE_KEY_MAESTROS);
        CacheService.getScriptCache().remove("maestros_inv_v2");
    }
    
    return res;
  } catch (e) {
    return { exito: false, error: e.toString() };
  }
}

// ==========================================
// SECCIÓN: PROVEEDORES (Restaurada y Optimizada)
// ==========================================

/**
 * Obtiene la lista completa de proveedores y sus categorías.
 * Se mantiene separada de la carga general para no hacer pesada la configuración.
 */
function srvObtenerProveedoresCompleto() {
  try {
    // 1. Traer Proveedores (Ordenados alfabéticamente)
    const p1 = dbSelect('proveedores', '*', '&order=razon_social.asc');
    
    // 2. Traer Categorías (Buscamos tipo PROVEEDOR o EMPRESA)
    // Nota: Usamos 'or' para traer ambas en una sola consulta si es necesario, 
    // o hacemos dos intentos como tenías antes. Lo haremos directo:
    const p2 = dbSelect('categorias', 'id, nombre', '&tipo=eq.PROVEEDOR&activo=eq.true');
    
    // Lógica de respaldo: Si no hay cat. PROVEEDOR, buscamos EMPRESA
    let categorias = p2.exito ? p2.datos : [];
    if (categorias.length === 0) {
       const backup = dbSelect('categorias', 'id, nombre', '&tipo=eq.PROVEEDOR&activo=eq.true');
       if(backup.exito) categorias = backup.datos;
    }

    return {
      exito: true,
      datos: {
        proveedores: p1.exito ? p1.datos : [],
        categorias: categorias
      }
    };

  } catch (e) {
    return { exito: false, error: e.toString() };
  }
}
/**
 * OBTIENE PROVEEDORES PAGINADOS (Optimización V2)
 * Reemplaza a srvObtenerProveedoresCompleto para reducir carga inicial.
 */
/**
 * SERVICIO: LISTAR PROVEEDORES (Buscador corregido)
 */
function srvListarProveedores(pagina, tamano, busqueda, filtros) {
  try {
    // Definimos todas las columnas necesarias para la tabla Y para el formulario
    const columnas = "id,razon_social,ruc,categoria_id,contacto_nombre,telefono,direccion,cuenta_bancaria";
    let params = "";

    // Lógica de búsqueda parcial (ilike) en Razón Social o RUC
    if (busqueda && busqueda.trim() !== "") {
      const b = busqueda.trim();
      params += `&or=(razon_social.ilike.*${b}*,ruc.ilike.*${b}*)`;
    }

    // Filtro por Categoría
    if (filtros && filtros.categoria) {
      params += `&categoria_id=eq.${filtros.categoria}`;
    }

    // Ordenamiento dinámico
    if (filtros && filtros.orden) {
      switch(filtros.orden) {
        case 'za': params += "&order=razon_social.desc"; break;
        case 'new': params += "&order=id.desc"; break;
        default: params += "&order=razon_social.asc";
      }
    } else {
      params += "&order=razon_social.asc";
    }

    // Ejecución de la consulta con paginación
    const res = dbSelect('proveedores', columnas, params, { pagina: pagina, tamano: tamano });

    if (!res.exito) throw new Error(res.error);

    return {
      exito: true,
      datos: res.datos,
      paginacion: {
        totalRegistros: res.total,
        paginaActual: pagina,
        itemsPorPagina: tamano,
        totalPaginas: Math.ceil(res.total / tamano)
      }
    };

  } catch (e) {
    console.error("Error en srvListarProveedores: " + e.toString());
    return { exito: false, error: e.toString() };
  }
}
/**
 * Función ligera para llenar solo el <select> de categorías
 * Se puede cachear para que sea instantánea.
 */
function srvObtenerCategoriasProveedor() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("maestros_cat_prov");
  if (cached) return JSON.parse(cached);

  let res = dbSelect('categorias', 'id, nombre', '&tipo=eq.PROVEEDOR&activo=eq.true&order=nombre.asc');
  if (!res.exito || res.datos.length === 0) {
    res = dbSelect('categorias', 'id, nombre', '&tipo=eq.EMPRESA&activo=eq.true&order=nombre.asc');
  }

  const respuesta = { exito: true, datos: res.exito ? res.datos : [] };
  cache.put("maestros_cat_prov", JSON.stringify(respuesta), 1800);
  return respuesta;
}