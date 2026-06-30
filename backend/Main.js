/**
 * MAIN.GS
 * Punto de entrada de la Web App y funciones utilitarias del sistema HTML.
 */

function doGet() {
  // Obligatorio usar createTemplate para que procese los <?!= ?>
  var template = HtmlService.createTemplateFromFile('Index');
  
  return template.evaluate()
      .setTitle('MTPC | Sistema Integrado V2')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Función para cargar las vistas HTML de forma asíncrona
function obtenerVista(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}