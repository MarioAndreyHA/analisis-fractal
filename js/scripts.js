document.addEventListener('DOMContentLoaded', event => {

    // --- CÓDIGO DE PREVISUALIZACIÓN Y CONTROLES ---
    const imageInput = document.getElementById('imageInput');
    const visualResult = document.getElementById('visualResult');
    
    // Controles específicos de métodos (pueden o no existir en la página actual)
    const thresholdRange = document.getElementById('thresholdRange');
    const thresholdValueDisplay = document.getElementById('thresholdValue');
    
    const blurRange = document.getElementById('blurRange');
    const blurValueDisplay = document.getElementById('blurValue');

    let currentMethod = null;

    if (window.pageMethod) {
        currentMethod = window.pageMethod;
        console.log("Método asignado desde HTML:", currentMethod);
    } else {
        // Intenta detectar el método si no está asignado (fallback)
        if (document.getElementById('scalesAnalyzed')) currentMethod = 'box_counting';
        else if (document.getElementById('grayLevels')) currentMethod = 'dbc';
        else if (document.getElementById('hurstExponent')) currentMethod = 'wavelets';
        console.log("Método detectado (fallback):", currentMethod);
    }

    // Actualizar el número de la barrita Threshold en vivo (Solo en Box-Counting)
    if (thresholdRange && thresholdValueDisplay) {
        thresholdRange.addEventListener('input', function() {
            thresholdValueDisplay.textContent = this.value;
        });
    }

    // Actualizar el número de la barrita Blur en vivo (Solo en DBC)
    if (blurRange && blurValueDisplay) {
        blurRange.addEventListener('input', function() {
            blurValueDisplay.textContent = this.value;
        });
    }

    if (imageInput && visualResult) {
        imageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    visualResult.src = event.target.result;
                    visualResult.alt = `Imagen original: ${file.name}`;

                    if (currentMethod) {
                       clearResultsTable(currentMethod);
                    }
                }
                reader.readAsDataURL(file);
            }
        });
    }

    const downloadButton = document.getElementById('downloadButton');
    if (downloadButton) {
        downloadButton.addEventListener('click', function() {
            console.log("Botón de descarga presionado.");
             if (currentMethod) {
                 downloadResultsAsCSV(currentMethod);
             } else {
                 alert("No se pudo determinar el método para la descarga. Intenta analizar primero.");
             }
        });
    }

    // --- CÓDIGO DE ENVÍO AL SERVIDOR (AQUÍ ESTÁ LA MAGIA) ---
    const uploadBtn = document.getElementById('uploadButton');
    if (uploadBtn && imageInput) {
        // Clonamos el botón para asegurarnos de que no tenga eventos repetidos
        const newUploadBtn = uploadBtn.cloneNode(true);
        uploadBtn.parentNode.replaceChild(newUploadBtn, uploadBtn);

        newUploadBtn.addEventListener('click', () => {
            const file = imageInput.files[0];
            if (!file) {
                alert("Por favor, selecciona un archivo."); 
                return;
            }
            
            setLoadingState(true);
            const formData = new FormData();
            formData.append('image', file);
            formData.append('method', currentMethod);

            // --- RECOLECCIÓN DINÁMICA DE PARÁMETROS SEGÚN EL MÉTODO ---
            
            if (currentMethod === 'box_counting') {
                if (document.getElementById('thresholdRange')) {
                    formData.append('threshold', document.getElementById('thresholdRange').value);
                }
            } 
            else if (currentMethod === 'dbc') {
                if (document.getElementById('blurRange')) {
                    formData.append('blur', document.getElementById('blurRange').value);
                }
                if (document.getElementById('resolutionSelect')) {
                    formData.append('resolution', document.getElementById('resolutionSelect').value);
                }
                if (document.getElementById('contrastSwitch')) {
                    formData.append('contrast', document.getElementById('contrastSwitch').checked);
                }
            }
            else if (currentMethod === 'wavelets') {
                if (document.getElementById('waveletFamily')) {
                    formData.append('waveletType', document.getElementById('waveletFamily').value);
                }
                if (document.getElementById('decompLevels')) {
                    formData.append('maxLevel', document.getElementById('decompLevels').value);
                }
            }

            // OJO: Asegúrate de que el puerto aquí coincida con el que usas en app.py (5500)
            fetch('http://127.0.0.1:5500/api/analizar', { 
                method: 'POST', 
                body: formData 
            })
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => { 
                        throw new Error(`Error: ${response.status} ${response.statusText} - ${text}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                console.log(`Resultados ${currentMethod}:`, data);
                if (data.error) {
                     alert(`Error en el cálculo: ${data.error}`);
                     clearResultsTable(currentMethod);
                } else {
                     displayResults(data, currentMethod);
                }
                setLoadingState(false);
            })
            .catch(error => {
                console.error(`Error detallado capturado:`, error);
                console.warn(`Advertencia al analizar con ${currentMethod}: ${error.message}. Resultados podrían haberse mostrado.`);
                setLoadingState(false);
            });
        });
    }
});


// --- FUNCIONES AUXILIARES (Quedan igual) ---

function displayResults(data, methodName) {
    console.log(`Mostrando resultados para: ${methodName}`);
    try {
        if (methodName === 'box_counting') {
            document.getElementById('fractalDimension').textContent = data.dimension || '-';
            document.getElementById('rSquared').textContent = data.r_squared || '-';
            document.getElementById('imageResolution').textContent = data.imageResolution || '-';
            document.getElementById('processingTime').textContent = data.processingTime || '-';
            document.getElementById('scalesAnalyzed').textContent = data.scalesAnalyzed || '-';
        } else if (methodName === 'dbc') {
            document.getElementById('fractalDimension').textContent = data.dimension || '-';
            document.getElementById('rSquared').textContent = data.r_squared || '-';
            document.getElementById('grayLevels').textContent = data.grayLevels || '-';
            document.getElementById('processingTime').textContent = data.processingTime || '-';
            document.getElementById('lineSlope').textContent = data.lineSlope || '-';
        } else if (methodName === 'wavelets') {
            document.getElementById('fractalDimension').textContent = data.dimension || '-';
            document.getElementById('hurstExponent').textContent = data.hurstExponent || '-';
            const rSquaredEl = document.getElementById('rSquared'); 
            if (rSquaredEl) rSquaredEl.textContent = data.r_squared || '-';
            document.getElementById('waveletType').textContent = data.waveletType || '-';
            document.getElementById('decompositionLevels').textContent = data.decompositionLevels || '-';
            document.getElementById('processingTime').textContent = data.processingTime || '-';
        } else {
            console.error("displayResults: Método desconocido:", methodName);
        }

        const visualResult = document.getElementById('visualResult');
        if (visualResult && data.processed_image_data_uri) {
            visualResult.src = data.processed_image_data_uri;
            // --- LLAMAMOS A LA GRÁFICA ---
            if (data.plotData) {
                drawChart(data.plotData, methodName);
            }
            if (methodName === 'box_counting') {
                 visualResult.alt = `Imagen binarizada usada para Box-Counting`;
            } else if (methodName === 'dbc') {
                 visualResult.alt = `Imagen en escala de grises usada para DBC`;
            } else if (methodName === 'wavelets') {
                 visualResult.alt = `Visualización de análisis Wavelet (si aplica)`; 
            } else {
                 visualResult.alt = `Imagen procesada con ${methodName}`;
            }
        } else {
             console.log("No se recibió imagen procesada o no es aplicable para este método.");
        }
    } catch (error) {
         console.error("Error actualizando la tabla/imagen:", error);
         alert("Ocurrió un error al mostrar los resultados en la página. Revisa la consola (F12).");
    }
}

function clearResultsTable(methodName) {
    console.log(`Limpiando tabla para: ${methodName}`);
    try {
        if (methodName === 'box_counting') {
            document.getElementById('fractalDimension').textContent = '-';
            document.getElementById('rSquared').textContent = '-';
            document.getElementById('imageResolution').textContent = '-';
            document.getElementById('processingTime').textContent = '-';
            document.getElementById('scalesAnalyzed').textContent = '-';
        } else if (methodName === 'dbc') {
            document.getElementById('fractalDimension').textContent = '-';
            document.getElementById('rSquared').textContent = '-';
            document.getElementById('grayLevels').textContent = '-';
            document.getElementById('processingTime').textContent = '-';
            document.getElementById('lineSlope').textContent = '-';
        } else if (methodName === 'wavelets') {
            document.getElementById('fractalDimension').textContent = '-';
            document.getElementById('hurstExponent').textContent = '-';
            const rSquaredEl = document.getElementById('rSquared');
            if(rSquaredEl) rSquaredEl.textContent = '-';
            document.getElementById('waveletType').textContent = '-';
            document.getElementById('decompositionLevels').textContent = '-';
            document.getElementById('processingTime').textContent = '-';
        } else {
             console.error("clearResultsTable: Método desconocido:", methodName);
        }
    } catch (error) {
         console.error("Error limpiando la tabla:", error);
    }
}

function setLoadingState(isLoading) {
    const uploadButton = document.getElementById('uploadButton');
    if (uploadButton) {
        if (isLoading) {
            uploadButton.disabled = true;
            uploadButton.innerHTML = `
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                Analizando...
            `;
        } else {
            uploadButton.disabled = false;
            uploadButton.innerHTML = 'Ejecutar Análisis'; // Ajusté el texto para que coincida con tu HTML
        }
    }
}

// --- NUEVA FUNCIÓN DE REPORTE INTERACTIVO ---
function downloadResultsAsCSV(methodName) {
    let metricsHTML = "";

    try {
        // 1. Recolectar las métricas de la tabla según el método
        if (methodName === 'box_counting') {
            metricsHTML += `<tr><td>Dimensión Fractal (D)</td><td><strong>${document.getElementById('fractalDimension').textContent}</strong></td></tr>`;
            metricsHTML += `<tr><td>Coeficiente R²</td><td><strong>${document.getElementById('rSquared').textContent}</strong></td></tr>`;
            metricsHTML += `<tr><td>Resolución de Imagen</td><td><strong>${document.getElementById('imageResolution').textContent}</strong></td></tr>`;
            metricsHTML += `<tr><td>Tiempo de Procesamiento</td><td><strong>${document.getElementById('processingTime').textContent}</strong></td></tr>`;
            metricsHTML += `<tr><td>Escalas Analizadas</td><td><strong>${document.getElementById('scalesAnalyzed').textContent}</strong></td></tr>`;
        }
        else if (methodName === 'dbc') {
             metricsHTML += `<tr><td>Dimensión Fractal (DBC)</td><td><strong>${document.getElementById('fractalDimension').textContent}</strong></td></tr>`;
             metricsHTML += `<tr><td>Coeficiente R²</td><td><strong>${document.getElementById('rSquared').textContent}</strong></td></tr>`;
             metricsHTML += `<tr><td>Niveles de Gris</td><td><strong>${document.getElementById('grayLevels').textContent}</strong></td></tr>`;
             metricsHTML += `<tr><td>Tiempo de Procesamiento</td><td><strong>${document.getElementById('processingTime').textContent}</strong></td></tr>`;
             metricsHTML += `<tr><td>Pendiente de la Recta</td><td><strong>${document.getElementById('lineSlope').textContent}</strong></td></tr>`;
        }
        else if (methodName === 'wavelets') {
             metricsHTML += `<tr><td>Dimensión Fractal (D)</td><td><strong>${document.getElementById('fractalDimension').textContent}</strong></td></tr>`;
             metricsHTML += `<tr><td>Exponente de Hurst (H)</td><td><strong>${document.getElementById('hurstExponent').textContent}</strong></td></tr>`;
             const rSquaredEl = document.getElementById('rSquared');
             if (rSquaredEl) metricsHTML += `<tr><td>Coeficiente R² (Ajuste)</td><td><strong>${rSquaredEl.textContent}</strong></td></tr>`;
             metricsHTML += `<tr><td>Tipo de Wavelet</td><td><strong>${document.getElementById('waveletType').textContent}</strong></td></tr>`;
             metricsHTML += `<tr><td>Niveles de Descomposición</td><td><strong>${document.getElementById('decompositionLevels').textContent}</strong></td></tr>`;
             metricsHTML += `<tr><td>Tiempo de Procesamiento</td><td><strong>${document.getElementById('processingTime').textContent}</strong></td></tr>`;
        }
        else {
            alert("No se pudo generar el reporte: método desconocido.");
            return;
        }

        // 2. Atrapar la imagen procesada con todo y animación (Base64)
        const visualResultSrc = document.getElementById('visualResult').src;

        // 3. Crear un diseño elegante para el Reporte
        const htmlContent = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Reporte de Análisis - ${methodName.toUpperCase()}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5; color: #333; padding: 40px 20px; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 8px 16px rgba(0,0,0,0.1); }
                .header { border-bottom: 3px solid #0d6efd; padding-bottom: 20px; margin-bottom: 30px; text-align: center; }
                h1 { color: #0d6efd; margin: 0 0 10px 0; }
                .method-badge { display: inline-block; background-color: #e9ecef; padding: 5px 15px; border-radius: 20px; font-weight: bold; color: #495057; text-transform: uppercase; letter-spacing: 1px; font-size: 0.9em; }
                h2 { color: #495057; margin-top: 30px; font-size: 1.3em; border-left: 4px solid #0d6efd; padding-left: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { padding: 15px; text-align: left; border-bottom: 1px solid #dee2e6; }
                th { background-color: #f8f9fa; color: #495057; }
                .image-container { text-align: center; margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; border: 1px dashed #ced4da; }
                img { max-width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
                .footer { margin-top: 40px; font-size: 0.85em; color: #6c757d; text-align: center; border-top: 1px solid #dee2e6; padding-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Reporte de Análisis Fractal</h1>
                    <div class="method-badge">Método: ${methodName.replace('_', ' ')}</div>
                </div>
                
                <h2>Métricas Calculadas</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Parámetro Analizado</th>
                            <th>Resultado Obtenido</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${metricsHTML}
                    </tbody>
                </table>

                <h2>Visualización del Proceso</h2>
                <div class="image-container">
                    <img src="${visualResultSrc}" alt="Imagen Procesada">
                </div>
                
                <div class="footer">
                    Generado automáticamente por la Herramienta de Cálculo Fractal. <br>
                    Fecha de generación: ${new Date().toLocaleString()}
                </div>
            </div>
        </body>
        </html>
        `;

        // 4. Empaquetar y descargar como archivo .html
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `reporte_fractal_${methodName}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log("Reporte interactivo generado y descargado.");

    } catch (error) {
        console.error("Error al generar el reporte:", error);
        alert("Error al intentar generar el archivo. Asegúrate de que los resultados se hayan calculado y la imagen esté en pantalla.");
    }
}

// --- NUEVA FUNCIÓN: DIBUJAR GRÁFICA INTERACTIVA ---
function drawChart(plotData, methodName) {
    const ctx = document.getElementById('regressionChart');
    if (!ctx) return;

    // Si ya existe una gráfica anterior, la borramos para que no se encimen
    if (window.regressionChartInstance) {
        window.regressionChartInstance.destroy();
    }

    // 1. Armamos los puntos dispersos (Scatter)
    const scatterData = plotData.x.map((x_val, index) => ({x: x_val, y: plotData.y[index]}));

    // 2. Calculamos los dos extremos de la línea recta usando la fórmula: y = mx + b
    const minX = Math.min(...plotData.x);
    const maxX = Math.max(...plotData.x);
    const lineData = [
        {x: minX, y: (plotData.slope * minX) + plotData.intercept},
        {x: maxX, y: (plotData.slope * maxX) + plotData.intercept}
    ];

    // 3. Ajustamos los textos de los ejes según el método
    let xLabel = "Log(1 / Tamaño de Caja)";
    let yLabel = "Log(Número de Cajas)";
    if (methodName === 'wavelets') {
        xLabel = "Nivel de Descomposición (j)";
        yLabel = "Log2(Varianza)";
    }

    // 4. Dibujamos la gráfica
    window.regressionChartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Puntos Evaluados',
                data: scatterData,
                backgroundColor: '#dc3545', // Rojo para los puntos
                pointRadius: 6,
                pointHoverRadius: 8
            }, {
                type: 'line',
                label: 'Pendiente (Dimensión Fractal)',
                data: lineData,
                borderColor: '#0d6efd', // Azul para la línea
                borderWidth: 2,
                fill: false,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: xLabel, font: {weight: 'bold'} } },
                y: { title: { display: true, text: yLabel, font: {weight: 'bold'} } }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `X: ${context.parsed.x.toFixed(3)}, Y: ${context.parsed.y.toFixed(3)}`;
                        }
                    }
                }
            }
        }
    });
}