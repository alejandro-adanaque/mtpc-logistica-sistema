 /**
 * SERVICIO: PRÉSTAMOS
 * Gestión de préstamos a técnicos y devoluciones.
 */

function guardarPrestamoBackend(data) {
  try {
    // 1. Insertar Cabecera
    const resCab = dbInsert('prestamos', data.cabecera);
    if (!resCab.exito) return { exito: false, error: resCab.error };
    const idPrestamo = resCab.datos[0].id;

    // 2. Insertar Detalles
    const detalles = data.items.map(i => ({
        prestamo_id: idPrestamo,
        producto_id: i.producto_id,
        descripcion: i.nombre,
        cantidad_prestada: i.cantidad,
        cantidad_pendiente: i.cantidad,
        numero_serie: i.numero_serie
    }));

    dbInsert('detalles_prestamo', detalles);
    return { exito: true };

  } catch (e) { return { exito: false, error: e.toString() }; }
}

function ejecutarDevolucionBackend(idPrestamo) {
  try {
    // 1. Obtener items pendientes
    const resItems = dbSelect('detalles_prestamo', '*', `&prestamo_id=eq.${idPrestamo}&cantidad_pendiente=gt.0`);
    
    if(resItems.exito && resItems.datos.length > 0) {
        const items = resItems.datos;
        // 2. Devolver stock
        items.forEach(item => {
            moverStock(item.producto_id, item.cantidad_pendiente);
        });
        
        // 3. Marcar detalles como devueltos
        dbUpdate('detalles_prestamo', { cantidad_pendiente: 0 }, `&prestamo_id=eq.${idPrestamo}`);
    }

    // 4. Cerrar Cabecera
    dbUpdate('prestamos', { 
        estado: 'FINALIZADO', 
        fecha_retorno_real: new Date().toISOString().split('T')[0]
    }, `&id=eq.${idPrestamo}`);

    return { exito: true };
  } catch (e) { return { exito: false, error: e.toString() }; }
}

function procesarDevolucionMasiva(listaItems) {
  try {
    var prestamosAfectados = new Set();

    for (var i = 0; i < listaItems.length; i++) {
      var item = listaItems[i];
      
      var resDet = dbSelect('detalles_prestamo', '*', '&id=eq.' + item.id_detalle);
      
      if (resDet.exito && resDet.datos.length > 0) {
        var detalle = resDet.datos[0];
        
        if (detalle.cantidad_pendiente > 0) {
          // Devolver stock
          moverStock(detalle.producto_id, detalle.cantidad_pendiente);
          
          // Marcar devuelto
          dbUpdate('detalles_prestamo', { cantidad_pendiente: 0 }, '&id=eq.' + item.id_detalle);
          
          prestamosAfectados.add(item.id_prestamo);
        }
      }
    }

    prestamosAfectados.forEach(function(idPrestamo) {
        verificarCierrePrestamo(idPrestamo);
    });

    return { exito: true };
    
  } catch (e) {
    return { exito: false, error: e.toString() };
  }
}

function verificarCierrePrestamo(idPrestamo) {
  var res = dbSelect('detalles_prestamo', 'id', '&prestamo_id=eq.' + idPrestamo + '&cantidad_pendiente=gt.0');
  
  if (res.exito && res.datos.length === 0) {
      dbUpdate('prestamos', { 
          estado: 'FINALIZADO', 
          fecha_retorno_real: new Date().toISOString().split('T')[0] 
      }, '&id=eq.' + idPrestamo);
  }
}
