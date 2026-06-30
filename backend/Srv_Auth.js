/**
 * SERVICIO: AUTENTICACIÓN Y USUARIOS
 * Maneja el acceso al sistema y la lista de equipo.
 */

/**
 * Valida las credenciales del usuario (Mantiene tu lógica original)
 */
function validarLogin(usuario, password) {
  try {
    // Buscamos al usuario por email
    const respuesta = dbSelect('usuarios', '*', `email=eq.${usuario}`);
    
    if (!respuesta.exito || respuesta.datos.length === 0) {
      return { exito: false, error: "Usuario no encontrado" };
    }

    const userDb = respuesta.datos[0];

    // Verificación de contraseña (texto plano según tu DB actual)
    if (userDb.password_hash === password) {
      
      // Verificación de estado activo
      if (userDb.estado === false) {
        return { exito: false, error: "Usuario inactivo." };
      }
      
      return { 
        exito: true, 
        id: userDb.id, 
        nombre: userDb.nombre_completo, 
        rol: userDb.rol 
      };
    } else {
      return { exito: false, error: "Contraseña incorrecta" };
    }
  } catch (e) { 
    return { exito: false, error: "Error en servidor: " + e.toString() }; 
  }
}

/**
 * Obtiene la lista completa de miembros (Para filtros y tablas)
 */
function srvObtenerUsuarios() {
  try {
    const respuesta = dbSelect('usuarios', 'id, nombre_completo, rol, email, estado, password_hash', '&order=nombre_completo.asc');
    return respuesta;
  } catch (e) {
    return { exito: false, error: e.toString() };
  }
}

/**
 * Guarda o actualiza un miembro del equipo (Para el módulo Configuración)
 */
function srvGuardarUsuario(datos, id = null) {
  try {
    if (id) {
      // Actualización de usuario existente
      return dbUpdate('usuarios', datos, `&id=eq.${id}`);
    } else {
      // Creación de nuevo usuario
      if (datos.estado === undefined) datos.estado = true;
      
      // Si no se asigna contraseña, ponemos un marcador para evitar nulos en la BD
      if (!datos.password_hash) {
        datos.password_hash = "SIN_ACCESO_" + Date.now();
      }
      
      return dbInsert('usuarios', datos);
    }
  } catch (e) {
    return { exito: false, error: e.toString() };
  }
}