/**
 * SERVICIO: LOGÍSTICA
 * Gestión de Compras (Entradas) y Despachos (Salidas).
 */

// --- COMPRAS ---
function registrarCompraCompleta(cabecera, items) {
  try {
    if (!cabecera.cuenta_pago_id) return { exito: false, error: "Falta Cuenta de Pago" };

    // 1. Obtener correlativo
    const resCuenta = dbSelect('cuentas_pago', 'correlativo_actual, prefijo', `&id=eq.${cabecera.cuenta_pago_id}`);
    if (!resCuenta.exito) return { exito: false, error: "Error BD: " + resCuenta.error };
    
    const cta = resCuenta.datos[0];
    const nuevoCorr = (cta.correlativo_actual || 0) + 1;
    const prefijo = cta.prefijo || 'GEN';
    cabecera.codigo_orden = `OC${prefijo}-${nuevoCorr.toString().padStart(5, '0')}`;

    // 2. Guardar Cabecera
    const resCompra = dbInsert('compras', cabecera);
    if (!resCompra.exito) return { exito: false, error: resCompra.error };
    const compraId = resCompra.datos[0].id;

    // 3. Guardar Items y Actualizar Stock
    for (let rawItem of items) {
        const itemLimpio = {
            compra_id: compraId,
            producto_id: rawItem.producto_id ? parseInt(rawItem.producto_id) : null,
            descripcion: rawItem.descripcion,
            cantidad: rawItem.cantidad,
            precio_unitario: rawItem.precio_unitario,
            total_linea: rawItem.total_linea,
            referencia: rawItem.referencia
        };
        dbInsert('detalles_compra', itemLimpio);

        if (cabecera.estado === 'Confirmado' && itemLimpio.producto_id) {
            moverStock(itemLimpio.producto_id, itemLimpio.cantidad); // Llama a Srv_Inventario
        }
    }

    // 4. Actualizar correlativo
   dbUpdate('cuentas_pago', { correlativo_actual: nuevoCorr }, `&id=eq.${cabecera.cuenta_pago_id}`);
    
    return { 
      exito: true, 
      codigo: cabecera.codigo_orden, 
      id: compraId 
    };

  } catch (e) { 
    return { exito: false, error: e.toString() }; 
  }
}

function eliminarCompra(compraId) {
    try {
        const resC = dbSelect('compras', 'estado', `&id=eq.${compraId}`);
        if(!resC.exito || resC.datos.length === 0) return { exito: false, error: "Compra no encontrada" };
        
        const esConfirmada = resC.datos[0].estado === 'Confirmado';

        if (esConfirmada) {
            const resItems = dbSelect('detalles_compra', 'producto_id, cantidad', `&compra_id=eq.${compraId}`);
            if (resItems.exito) {
                resItems.datos.forEach(item => {
                    if (item.producto_id) moverStock(item.producto_id, -Math.abs(item.cantidad)); 
                });
            }
        }
        dbDelete('detalles_compra', `&compra_id=eq.${compraId}`);
        const resDel = dbDelete('compras', `&id=eq.${compraId}`);
        if(!resDel.exito) return { exito: false, error: resDel.error };
        return { exito: true };
    } catch (e) { return { exito: false, error: e.toString() }; }
}

function confirmarOrdenExistente(compraId) {
    try {
        const resC = dbSelect('compras', 'estado', `&id=eq.${compraId}`);
        if(resC.datos[0].estado === 'Confirmado') return { exito: false, error: 'Ya estaba confirmada' };

        const resItems = dbSelect('detalles_compra', 'producto_id, cantidad', `&compra_id=eq.${compraId}`);
        if(resItems.exito) {
            resItems.datos.forEach(item => {
                if(item.producto_id) moverStock(item.producto_id, item.cantidad);
            });
        }
        dbUpdate('compras', { estado: 'Confirmado' }, `&id=eq.${compraId}`);
        return { exito: true };
    } catch (e) { return { exito: false, error: e.toString() }; }
}

// --- DESPACHOS ---
function registrarDespacho(cabecera, items) {
  try {
    const idResponsable = cabecera.usuario_id || 1; 
    cabecera.usuario_responsable_id = idResponsable;

    const resLast = dbSelect('despachos', 'codigo_despacho', '&limit=1&order=id.desc');
    let nextId = 1;
    if (resLast.exito && resLast.datos.length > 0) {
        const lastCode = resLast.datos[0].codigo_despacho;
        if(lastCode && lastCode.includes('-')) {
            nextId = parseInt(lastCode.split('-')[1]) + 1;
        }
    }
    cabecera.codigo_despacho = `DESP-${nextId.toString().padStart(5, '0')}`;

    const dataParaInsertar = {...cabecera};
    delete dataParaInsertar.usuario_id; 

    const resHead = dbInsert('despachos', dataParaInsertar);
    if (!resHead.exito) return { exito: false, error: resHead.error };
    
    const despachoId = resHead.datos[0].id;

    for (let item of items) {
        if (cabecera.estado === 'Confirmado') {
            moverStock(item.producto_id, -Math.abs(item.cantidad));
        }

        const detalle = {
            despacho_id: despachoId,
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            descripcion: item.descripcion, 
            numero_serie_equipo: item.numero_serie, 
            precio_unitario_venta: item.precio_unitario_venta
        };
        dbInsert('detalles_despacho', detalle);
    }
    
    return { exito: true, codigo: cabecera.codigo_despacho, id_generado: despachoId };

  } catch (e) { return { exito: false, error: e.toString() }; }
}

function confirmarDespachoBackend(id) {
    try {
        const resCab = dbSelect('despachos', 'estado', `&id=eq.${id}`);
        if (!resCab.exito || resCab.datos.length === 0) return { exito: false, error: 'Despacho no encontrado' };
        if (resCab.datos[0].estado === 'Confirmado') return { exito: false, error: 'Ya está confirmado' };

        const resItems = dbSelect('detalles_despacho', '*', `&despacho_id=eq.${id}`);
        if (!resItems.exito) return { exito: false, error: 'Error al leer items' };

        for (const item of resItems.datos) {
            // Físico
            if (item.producto_id) moverStock(item.producto_id, -Math.abs(item.cantidad));
            
            // Lote
            if (item.lote_id) {
                const resL = dbSelect('inventario_lotes', 'stock_actual', `&id=eq.${item.lote_id}`);
                if (resL.datos.length > 0) {
                    const nuevo = (resL.datos[0].stock_actual || 0) - item.cantidad;
                    dbUpdate('inventario_lotes', { stock_actual: nuevo }, `&id=eq.${item.lote_id}`);
                }
            }
        }

        const resUpd = dbUpdate('despachos', { estado: 'Confirmado' }, `&id=eq.${id}`);
        return resUpd.exito ? { exito: true } : { exito: false, error: resUpd.error };

    } catch (e) { return { exito: false, error: e.toString() }; }
}

function eliminarDespachoBackend(id) {
  try {
    const resHead = dbSelect('despachos', 'estado', `&id=eq.${id}`);
    if (!resHead.exito) return { exito: false, error: 'No encontrado' };
    
    const estabaConfirmado = resHead.datos[0].estado === 'Confirmado';

    if (estabaConfirmado) {
        const resDet = dbSelect('detalles_despacho', '*', `&despacho_id=eq.${id}`);
        if (resDet.exito) {
            for (const item of resDet.datos) {
               // A. Restaurar Físico
               if (item.producto_id) moverStock(item.producto_id, item.cantidad);

               // B. Restaurar Lote
               if (item.lote_id) {
                   const resL = dbSelect('inventario_lotes', 'stock_actual', `&id=eq.${item.lote_id}`);
                   if (resL.datos.length > 0) {
                       const stockLoteRestaurado = (resL.datos[0].stock_actual || 0) + item.cantidad;
                       dbUpdate('inventario_lotes', { stock_actual: stockLoteRestaurado }, `&id=eq.${item.lote_id}`);
                   }
               }
            }
        }
    }

    dbDelete('detalles_despacho', `&despacho_id=eq.${id}`);
    return dbDelete('despachos', `&id=eq.${id}`);

  } catch (e) { return { exito: false, error: e.toString() }; }
}