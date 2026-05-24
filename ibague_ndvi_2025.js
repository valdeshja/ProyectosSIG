var gaul2 = ee.FeatureCollection('FAO/GAUL/2015/level2');
var ibague = gaul2.filter(ee.Filter.eq('ADM2_NAME', 'Ibague'));

var t1 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate('2025-01-01', '2025-02-28')
  .filterBounds(ibague)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30));
print('Ene-feb 2025 (<30% nubes):', t1.size());

var t2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate('2025-07-01', '2025-08-31')
  .filterBounds(ibague)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30));
print('Jul-ago 2025 (<30% nubes):', t2.size());

var t1b = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate('2025-01-01', '2025-02-28')
  .filterBounds(ibague)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 50));
print('Ene-feb 2025 (<50% nubes):', t1b.size());

var t2b = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate('2025-07-01', '2025-08-31')
  .filterBounds(ibague)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 50));
print('Jul-ago 2025 (<50% nubes):', t2b.size());

// ============================================================
//  NDVI — IBAGUÉ, TOLIMA
//  Sentinel-2 SR · Temporada seca junio–septiembre 2025
//  Nubosidad ≤ 50% · Enmascaramiento SCL
//  Autor: Andrés Valdés Henao
// ============================================================

// ── 1. ÁREA DE ESTUDIO ──────────────────────────────────────
var gaul2 = ee.FeatureCollection('FAO/GAUL/2015/level2');
var ibague = gaul2.filter(ee.Filter.eq('ADM2_NAME', 'Ibague'));

Map.centerObject(ibague, 11);
Map.addLayer(ee.Image().paint(ibague, 0, 2), {palette: ['white']}, 'Límite Ibagué');

// ── 2. FUNCIÓN: ENMASCARAR NUBES CON SCL ────────────────────
var enmascararNubes = function(imagen) {
  var scl = imagen.select('SCL');
  var mascara = scl.eq(4)  // Vegetación
    .or(scl.eq(5))         // Suelo desnudo
    .or(scl.eq(6))         // Agua
    .or(scl.eq(11));       // Nieve
  return imagen.updateMask(mascara);
};

// ── 3. COLECCIÓN SENTINEL-2 ──────────────────────────────────
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate('2025-06-01', '2025-09-30')
  .filterBounds(ibague)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 50))
  .map(enmascararNubes);

print('Imágenes disponibles:', s2.size());
print('Fechas de imágenes:', s2.aggregate_array('system:index'));

// ── 4. CALCULAR NDVI POR IMAGEN ──────────────────────────────
var calcularNDVI = function(imagen) {
  return imagen.normalizedDifference(['B8', 'B4'])
    .rename('NDVI')
    .copyProperties(imagen, ['system:time_start']);
};

var coleccionNDVI = s2.map(calcularNDVI);

// ── 5. MOSAICO: MEDIANA DE NDVI ──────────────────────────────
var ndviMediana = coleccionNDVI.median().clip(ibague);

// ── 6. VISUALIZACIÓN NDVI CONTINUO ──────────────────────────
var ndviVis = {
  min: -0.1,
  max: 0.8,
  palette: [
    '#d73027',
    '#f46d43',
    '#fdae61',
    '#fee08b',
    '#d9ef8b',
    '#a6d96a',
    '#66bd63',
    '#1a9850'
  ]
};

Map.addLayer(ndviMediana, ndviVis, 'NDVI jun-sep 2025');

// ── 7. ESTADÍSTICAS DE NDVI ──────────────────────────────────
var stats = ndviMediana.reduceRegion({
  reducer: ee.Reducer.mean()
    .combine(ee.Reducer.min(), '', true)
    .combine(ee.Reducer.max(), '', true)
    .combine(ee.Reducer.stdDev(), '', true),
  geometry: ibague.geometry(),
  scale: 100,
  maxPixels: 1e10
});
print('Estadísticas NDVI (jun-sep 2025):', stats);

// ── 8. HISTOGRAMA DE NDVI ────────────────────────────────────
var histograma = ui.Chart.image.histogram({
  image: ndviMediana,
  region: ibague.geometry(),
  scale: 100,
  maxPixels: 1e10
}).setOptions({
  title: 'Distribución NDVI — Ibagué jun-sep 2025',
  hAxis: {title: 'NDVI'},
  vAxis: {title: 'Frecuencia de píxeles'},
  colors: ['#1a9850']
});
print(histograma);

// ── 9. CLASIFICACIÓN POR UMBRAL DE NDVI ──────────────────────
var clasificacionNDVI = ee.Image(0)
  .where(ndviMediana.lt(0.1),  1)  // Sin vegetación
  .where(ndviMediana.gte(0.1).and(ndviMediana.lt(0.3)), 2)  // Vegetación escasa
  .where(ndviMediana.gte(0.3).and(ndviMediana.lt(0.5)), 3)  // Vegetación moderada
  .where(ndviMediana.gte(0.5).and(ndviMediana.lt(0.7)), 4)  // Vegetación densa
  .where(ndviMediana.gte(0.7), 5)                            // Vegetación muy densa
  .updateMask(ndviMediana.mask())  // Huecos quedan vacíos, no rojos
  .clip(ibague);

var clasVis = {
  min: 1, max: 5,
  palette: ['#C4281B', '#E49635', '#DFC35A', '#88B053', '#397D49']
};

Map.addLayer(clasificacionNDVI, clasVis, 'Clases NDVI', false);

// Área por clase de NDVI (km²)
var areasNDVI = ee.Image.pixelArea().divide(1e6)
  .addBands(clasificacionNDVI.rename('clase'))
  .reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'clase'
    }),
    geometry: ibague.geometry(),
    scale: 100,
    maxPixels: 1e10
  });
print('Área por clase NDVI (km²):', areasNDVI);


// ── 11. LEYENDA ──────────────────────────────────────────────
var leyenda = ui.Panel({
  style: {position: 'bottom-left', padding: '8px 12px'}
});
leyenda.add(ui.Label({
  value: 'NDVI — jun-sep 2025',
  style: {fontWeight: 'bold', fontSize: '14px', margin: '0 0 6px 0'}
}));

var clases = [
  {color: '#C4281B', label: '< 0.1  Sin vegetación'},
  {color: '#E49635', label: '0.1–0.3  Veg. escasa'},
  {color: '#DFC35A', label: '0.3–0.5  Veg. moderada'},
  {color: '#88B053', label: '0.5–0.7  Veg. densa'},
  {color: '#397D49', label: '> 0.7  Veg. muy densa'}
];

clases.forEach(function(c) {
  var fila = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
  fila.add(ui.Label({
    style: {backgroundColor: c.color, padding: '8px', margin: '2px 6px 2px 0'}
  }));
  fila.add(ui.Label({value: c.label, style: {margin: '4px 0'}}));
  leyenda.add(fila);
});

Map.add(leyenda);
