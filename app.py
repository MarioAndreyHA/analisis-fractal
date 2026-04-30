from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from PIL import Image, ImageDraw, ImageFilter, ImageOps
import numpy as np
from sklearn.linear_model import LinearRegression
import time
import base64
import io
import pywt

#-----------------------------------------------------------------------------

# Flask: Le decimos a Flask que nuestra carpeta actual ('.') contiene los archivos web estáticos
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app) 

UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

#-----------------------------------------------------------------------------
# --- NUEVAS RUTAS PARA MOSTRAR LAS PÁGINAS WEB HTML ---

@app.route('/')
def home():
    # Cuando alguien entre a la raíz de tu sitio, le damos el index.html
    return app.send_static_file('index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    # Cuando alguien pida cualquier otro archivo (css, js, html), se lo damos automáticamente
    return app.send_static_file(filename)

#-----------------------------------------------------------------------------

def calcular_box_counting(image_array_grayscale, threshold=128):
    """
    Calcula la dimensión fractal y devuelve un GIF animado del proceso.
    """
    start_time = time.time()

    # --- 1. Binarización ---
    binary_image_bool = image_array_grayscale > threshold 
    binary_image_uint8 = (binary_image_bool * 255).astype(np.uint8) 
    
    pixels = np.argwhere(binary_image_bool) 
    if len(pixels) == 0:
        return {'error': 'No se encontraron píxeles de objeto (intenta cambiar el umbral).'}

    Lx = image_array_grayscale.shape[1]
    Ly = image_array_grayscale.shape[0]
    print(f"Dimensiones: {Lx}x{Ly}, Umbral Usado: {threshold}")

    # --- PREPARAR BASE PARA EL GIF ---
    base_image = Image.fromarray(binary_image_uint8).convert("RGB")
    frames = [] 

    # Algoritmo Box-Counting
    max_dim = max(Lx, Ly)
    n = int(np.floor(np.log2(max_dim))) if max_dim > 1 else 0
    n = max(1, n)
    sizes = 2**np.arange(n, 0, -1)
    
    counts = []
    box_sizes_r = []

    for size in sizes:
        if size < 1: continue
        
        num_boxes_x = int(np.ceil(Lx / size))
        num_boxes_y = int(np.ceil(Ly / size))
        occupied_boxes = np.zeros((num_boxes_y, num_boxes_x))
        
        for p in pixels:
            box_x = min(int(np.floor(p[1] / size)), num_boxes_x - 1)
            box_y = min(int(np.floor(p[0] / size)), num_boxes_y - 1)
            occupied_boxes[box_y, box_x] = 1
            
        box_count = np.sum(occupied_boxes)
        
        if box_count > 0:
            counts.append(box_count)
            box_sizes_r.append(1.0 / size)

            # --- MAGIA DEL GIF ---
            frame = base_image.copy()
            draw = ImageDraw.Draw(frame)
            
            for y in range(num_boxes_y):
                for x in range(num_boxes_x):
                    if occupied_boxes[y, x] == 1:
                        x0 = x * size
                        y0 = y * size
                        x1 = x0 + size
                        y1 = y0 + size
                        draw.rectangle([x0, y0, x1, y1], outline="#00FF00", width=1)
            
            frames.append(frame)

    if len(counts) < 2:
        return {'error': 'Escalas insuficientes.'}

    # Regresión Lineal
    log_counts = np.log(counts)
    log_sizes = np.log(box_sizes_r)
    X = log_sizes.reshape(-1, 1)
    y = log_counts
    model = LinearRegression()
    model.fit(X, y)
    dimension = model.coef_[0]
    r_squared = model.score(X, y)
    end_time = time.time()
    processing_time = f"{end_time - start_time:.2f}s"
    print(f"Box-Counting: D={dimension:.3f}, R²={r_squared:.3f}")

    # --- CODIFICAR GIF ---
    try:
        buffer = io.BytesIO()
        frames[0].save(buffer, format='GIF',
               save_all=True,
               append_images=frames[1:],
               duration=800) 
        
        img_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
        image_data_uri = f"data:image/gif;base64,{img_str}" 
    except Exception as e:
        print(f"Error al codificar el GIF animado: {e}")
        image_data_uri = None

    plot_data = {
        'x': X.flatten().tolist(),
        'y': y.tolist(),
        'slope': float(model.coef_[0]),
        'intercept': float(model.intercept_)
    }

    return {
        'dimension': f"{dimension:.3f}",
        'r_squared': f"{r_squared:.3f}",
        'imageResolution': f"{Lx}x{Ly}",
        'processingTime': processing_time,
        'scalesAnalyzed': len(counts),
        'processed_image_data_uri': image_data_uri,
        'plotData': plot_data
    }

#-----------------------------------------------------------------------------

def calcular_dbc(image_array_grayscale, mode='profundo'):
    start_time = time.time()

    Lx = image_array_grayscale.shape[1]
    Ly = image_array_grayscale.shape[0]
    
    base_image = Image.fromarray(image_array_grayscale).convert("RGBA")
    frames = []

    max_dim = max(Lx, Ly)
    n = int(np.floor(np.log2(max_dim))) if max_dim > 1 else 0
    n = max(1, n)
    
    if mode == 'rapido':
        sizes = 2**np.arange(1, n, 2)
    else:
        sizes = 2**np.arange(1, n)
        
    counts = []
    box_sizes_r = []

    max_gray_level = np.max(image_array_grayscale) if image_array_grayscale.size > 0 else 0
    max_gray_level = max(1, max_gray_level) 

    for size in sizes:
        if size < 2: continue
        
        box_count_nr = 0
        overlay = Image.new('RGBA', base_image.size, (0, 0, 0, 0))
        draw_overlay = ImageDraw.Draw(overlay)

        for y in range(0, Ly, size):
            for x in range(0, Lx, size):
                box = image_array_grayscale[y:min(y + size, Ly), x:min(x + size, Lx)]
                if box.size == 0: continue 

                min_gray = int(np.min(box))
                max_gray = int(np.max(box))

                min_k = int(np.floor(min_gray / (max_gray_level * (size / max_dim)))) 
                max_l = int(np.ceil(max_gray / (max_gray_level * (size / max_dim))))

                box_count_nr += (max_l - min_k + 1)

                intensidad = (max_gray - min_gray) / 255.0
                
                if intensidad < 0.5:
                    r = 0
                    g = int(255 * (intensidad * 2))
                    b = int(255 * (1 - intensidad * 2))
                else:
                    r = int(255 * ((intensidad - 0.5) * 2))
                    g = int(255 * (1 - (intensidad - 0.5) * 2))
                    b = 0
                
                alpha = int(40 + (140 * intensidad))
                
                x1 = min(x + size, Lx)
                y1 = min(y + size, Ly)
                
                draw_overlay.rectangle([x, y, x1, y1], fill=(r, g, b, alpha), outline=(r, g, b, 255), width=1)

        if box_count_nr > 0:
            counts.append(box_count_nr)
            box_sizes_r.append(1.0 / size)
            
            frame_combinado = Image.alpha_composite(base_image, overlay)
            frames.append(frame_combinado.convert("RGB"))

    if len(counts) < 2:
        return {'error': 'No se obtuvieron suficientes escalas válidas para el cálculo DBC.'}

    log_counts = np.log(counts)
    log_sizes = np.log(box_sizes_r)

    X = log_sizes.reshape(-1, 1)
    y = log_counts

    model = LinearRegression()
    model.fit(X, y)

    dimension = model.coef_[0]
    r_squared = model.score(X, y)
    slope = dimension

    end_time = time.time()
    processing_time = f"{end_time - start_time:.2f}s"
    print(f"DBC completado: D={dimension:.3f}, R²={r_squared:.3f}, Escalas={len(counts)}")

    try:
        buffer = io.BytesIO()
        if len(frames) > 0:
            frames.reverse() 
            frames[0].save(buffer, format='GIF', save_all=True, append_images=frames[1:], duration=800)
            img_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
            image_data_uri = f"data:image/gif;base64,{img_str}"
        else:
            image_data_uri = None
    except Exception as e:
        print(f"Error al codificar el GIF para DBC: {e}")
        image_data_uri = None

    plot_data = {
        'x': X.flatten().tolist(),
        'y': y.tolist(),
        'slope': float(model.coef_[0]),
        'intercept': float(model.intercept_)
    }

    return {
        'dimension': f"{dimension:.3f}",
        'r_squared': f"{r_squared:.3f}",
        'grayLevels': int(max_gray_level + 1),
        'processingTime': processing_time,
        'lineSlope': f"{slope:.3f}",
        'processed_image_data_uri': image_data_uri,
        'plotData': plot_data
    }

#-----------------------------------------------------------------------------

def calcular_wavelets(image_array_grayscale, wavelet='db4', max_level=None):
    start_time = time.time()

    Lx = image_array_grayscale.shape[1]
    Ly = image_array_grayscale.shape[0]
    print(f"Dimensiones para Wavelets: {Lx}x{Ly}")

    if max_level is None:
        w = pywt.Wavelet(wavelet)
        nivel_max_teorico = pywt.dwt_max_level(min(Lx, Ly), w.dec_len)
        max_level = min(nivel_max_teorico, 5)
    
    print(f"Usando Wavelet: {wavelet}, Niveles: {max_level}")

    frames = []
    frames.append(Image.fromarray(image_array_grayscale).convert("RGB"))

    for vis_level in range(1, max_level + 1):
        coeffs_vis = pywt.wavedec2(image_array_grayscale, wavelet, level=vis_level)
        arr_vis, _ = pywt.coeffs_to_array(coeffs_vis)
        arr_vis = np.log1p(np.abs(arr_vis))
        
        arr_min = arr_vis.min()
        arr_max = arr_vis.max()
        if arr_max > arr_min:
            arr_norm = 255.0 * (arr_vis - arr_min) / (arr_max - arr_min)
        else:
            arr_norm = np.zeros_like(arr_vis)
            
        frame_img = Image.fromarray(arr_norm.astype(np.uint8)).convert("RGB")
        frames.append(frame_img)

    coeffs = pywt.wavedec2(image_array_grayscale, wavelet, level=max_level)
    variances = []
    escalas = []

    for level in range(1, max_level + 1):
        detalles_h, detalles_v, detalles_d = coeffs[-level]
        detalles_completos = np.concatenate([detalles_h.flatten(), detalles_v.flatten(), detalles_d.flatten()])
        
        if detalles_completos.size > 0:
            varianza = np.var(detalles_completos)
            if varianza > 0: 
                variances.append(varianza)
                escalas.append(level) 

    if len(variances) < 2:
        return {'error': 'No se obtuvieron suficientes niveles para calcular la regresión de Wavelets.'}

    log_variances = np.log2(variances)
    X = np.array(escalas).reshape(-1, 1)
    y = log_variances

    model = LinearRegression()
    model.fit(X, y)

    pendiente = model.coef_[0]
    r_squared = model.score(X, y)
    hurst = pendiente / 2.0
    hurst = max(0.01, min(0.99, hurst))
    dimension = 3.0 - hurst

    end_time = time.time()
    processing_time = f"{end_time - start_time:.2f}s"
    print(f"Wavelets completado: H={hurst:.3f}, D={dimension:.3f}, R²={r_squared:.3f}")

    try:
        buffer = io.BytesIO()
        if len(frames) > 0:
            frames[0].save(buffer, format='GIF',
                   save_all=True,
                   append_images=frames[1:],
                   duration=1000) 
            
            img_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
            image_data_uri = f"data:image/gif;base64,{img_str}"
        else:
            image_data_uri = None
    except Exception as e:
        print(f"Error al codificar el GIF para Wavelets: {e}")
        image_data_uri = None

    plot_data = {
        'x': X.flatten().tolist(),
        'y': y.tolist(),
        'slope': float(pendiente), 
        'intercept': float(model.intercept_)
    }

    return {
        'dimension': f"{dimension:.3f}",
        'hurstExponent': f"{hurst:.3f}",
        'waveletType': wavelet,
        'decompositionLevels': max_level,
        'processingTime': processing_time,
        'r_squared': f"{r_squared:.3f}",
        'processed_image_data_uri': image_data_uri,
        'plotData': plot_data 
    }

#-----------------------------------------------------------------------------
# Define la ruta de la API que recibirá la imagen
@app.route('/api/analizar', methods=['POST'])
def analizar_imagen_api():
    print("¡Recibida petición en /api/analizar!")

    if 'image' not in request.files:
        print("Error: No se encontró 'image' en los archivos.")
        return jsonify({'error': 'No se envió archivo de imagen'}), 400

    file = request.files['image']
    metodo = request.form.get('method')

    if file.filename == '':
        print("Error: Nombre de archivo vacío.")
        return jsonify({'error': 'No se seleccionó archivo'}), 400
    if not metodo:
        print("Error: No se especificó método.")
        return jsonify({'error': 'No se especificó método'}), 400

    print(f"Archivo recibido: {file.filename}")
    print(f"Método solicitado: {metodo}")

    filepath = None
    if file:
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        try:
            file.save(filepath)
            print(f"Archivo guardado en: {filepath}")

            resultados = {}

            if metodo == 'box_counting':
                print("Procesando con Box Counting...")

                try:
                    threshold_value = int(request.form.get('threshold', 128))
                except ValueError:
                    threshold_value = 128 
                
                print(f"Umbral recibido: {threshold_value}")

                try:
                    img = Image.open(filepath).convert('L')
                    image_array = np.array(img)
                    
                    resultados = calcular_box_counting(image_array, threshold=threshold_value)

                    if 'error' in resultados:
                         return jsonify(resultados), 400 

                    if os.path.exists(filepath): 
                        os.remove(filepath) 
                    return jsonify(resultados) 

                except Exception as calc_error:
                    print(f"Error en calcular_box_counting o preprocesamiento: {calc_error}")
                    resultados = {'error': f'Error durante el cálculo: {str(calc_error)}'}
                    if os.path.exists(filepath): os.remove(filepath)
                    return jsonify(resultados), 500

            elif metodo == 'dbc':
                print("Procesando con DBC...")
                try:
                    blur_level = int(request.form.get('blur', 0))
                    resolution_mode = request.form.get('resolution', 'profundo')
                    contrast_enabled = request.form.get('contrast', 'false') == 'true'

                    print(f"Ajustes recibidos -> Blur: {blur_level}, Modo: {resolution_mode}, Contraste: {contrast_enabled}")

                    img = Image.open(filepath).convert('L')

                    if contrast_enabled:
                        img = ImageOps.autocontrast(img)
                        print("Contraste ecualizado.")

                    if blur_level > 0:
                        img = img.filter(ImageFilter.GaussianBlur(radius=blur_level))
                        print(f"Filtro Gaussiano aplicado (radio {blur_level}).")

                    image_array = np.array(img)
                    
                    resultados = calcular_dbc(image_array, mode=resolution_mode)

                    if 'error' in resultados:
                         return jsonify(resultados), 400

                    if os.path.exists(filepath): os.remove(filepath)
                    return jsonify(resultados)

                except Exception as calc_error:
                    print(f"Error en DBC: {calc_error}")
                    if os.path.exists(filepath): os.remove(filepath)
                    return jsonify({'error': f'Error: {str(calc_error)}'}), 500

            elif metodo == 'wavelets':
                print("Procesando con Wavelets...")
                try:
                    wavelet_type = request.form.get('waveletType', 'db4')
                    max_level_str = request.form.get('maxLevel', '0')
                    max_level = int(max_level_str) if max_level_str != '0' else None

                    print(f"Ajustes Wavelet -> Tipo: {wavelet_type}, Nivel Max: {max_level}")

                    img = Image.open(filepath).convert('L')
                    image_array = np.array(img)
                    
                    resultados = calcular_wavelets(image_array, wavelet=wavelet_type, max_level=max_level)

                    if 'error' in resultados:
                         return jsonify(resultados), 400

                    if os.path.exists(filepath): os.remove(filepath)
                    return jsonify(resultados)

                except Exception as calc_error:
                    print(f"Error en Wavelets: {calc_error}")
                    if os.path.exists(filepath): os.remove(filepath)
                    return jsonify({'error': f'Error: {str(calc_error)}'}), 500

        except Exception as e:
            print(f"Error general al procesar la subida: {e}")
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({'error': f'Error procesando el archivo: {str(e)}'}), 500

    return jsonify({'error': 'No se recibió ningún archivo válido'}), 400

# Ejecuta el Servidor
if __name__ == '__main__':
    print("Iniciando servidor Flask...")
    app.run(debug=True, host='0.0.0.0', port=5500)
