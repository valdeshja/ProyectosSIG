//  CAMBIO DE COBERTURA — IBAGUÉ, TOLIMA
//  Dynamic World · Mejor píxel por período
//  Período 1: 2017–2020 vs Período 2: 2021–2025
//  Autor: Andrés Valdés Henao

// 1. ÁREA DE ESTUDIO
var gaul2 = ee.FeatureCollection('FAO/GAUL/2015/level2');
var ibague = gaul2.filter(ee.Filter.eq('ADM2_NAME', 'Ibague'));

Map.centerObject(ibague, 11);
Map.addLayer(ee.Image().paint(ibague, 0, 2), {palette: ['white']}, 'Límite Ibagué');

// 2. PALETA Y CLASES
var DW_PALETTE = [
  '#419BDF', // 0 - Agua
  '#397D49', // 1 - Bosque
  '#88B053', // 2 - Pastizal
  '#7A87C6', // 3 - Veg. inundada
  '#E49635', // 4 - Cultivos
  '#DFC35A', // 5 - Arbustos
  '#C4281B', // 6 - Urbano
  '#A59B8F', // 7 - Suelo desnudo
  '#B39FE1'  // 8 - Nieve
];

var DW_NAMES = [
  'Agua', 'Bosque', 'Pastizal', 'Veg. inundada',
  'Cultivos', 'Arbustos', 'Urbano', 'Suelo desnudo', 'Nieve'
];

var visParams = {min: 0, max: 8, palette: DW_PALETTE};

var probBandas = ['water','trees','grass','flooded_vegetation',
                  'crops','shrub_and_scrub','built','bare','snow_and_ice'];

// 3. FUNCIÓN: MEJOR PÍXEL POR PERÍODO
var getMejorPixel = function(startDate, endDate) {
  var dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
    .filterDate(startDate, endDate)
    .filterBounds(ibague);

  var probPromedio = dw.select(probBandas).mean().clip(ibague);

  var clasificacion = probPromedio.toArray()
    .arrayArgmax()
    .arrayFlatten([['label']])
    .clip(ibague);

  return clasificacion;
};

// 4. MOSAICOS POR PERÍODO
var periodo1 = getMejorPixel('2017-01-01', '2020-12-31');
var periodo2 = getMejorPixel('2021-01-01', '2025-04-30');

print('Imágenes período 1 (2017-2020):',
  ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
    .filterDate('2017-01-01', '2020-12-31')
    .filterBounds(ibague).size()
);
print('Imágenes período 2 (2021-2025):',
  ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
    .filterDate('2021-01-01', '2025-04-30')
    .filterBounds(ibague).size()
);

// 5. VISUALIZACIÓN
Map.addLayer(periodo1, visParams, 'Cobertura 2017–2020', false);
Map.addLayer(periodo2, visParams, 'Cobertura 2021–2025', true);

// 6. MAPA DE CAMBIO
var cambio = periodo1.neq(periodo2).selfMask();
Map.addLayer(cambio, {palette: ['red']}, 'Zonas de cambio', false);

// 7. MATRIZ DE TRANSICIÓN
var matrizImg = periodo1.select('label').multiply(10)
  .add(periodo2.select('label'));

print('Matriz de transición (clase_origen * 10 + clase_destino):',
  matrizImg.reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: ibague.geometry(),
    scale: 30,
    maxPixels: 1e10
  })
);

// 8. ÁREA POR CLASE — AMBOS PERÍODOS
var calcularAreas = function(imagen, nombre) {
  var areas = ee.Image.pixelArea().divide(1e6)
    .addBands(imagen.select('label'))
    .reduceRegion({
      reducer: ee.Reducer.sum().group({
        groupField: 1,
        groupName: 'clase'
      }),
      geometry: ibague.geometry(),
      scale: 100,
      maxPixels: 1e10
    });
  print('Área por clase ' + nombre + ' (km²):', areas);
};

calcularAreas(periodo1, '2017-2020');
calcularAreas(periodo2, '2021-2025');


// 10. LEYENDA
var leyenda = ui.Panel({
  style: {position: 'bottom-left', padding: '8px 12px'}
});
leyenda.add(ui.Label({
  value: 'Cobertura del suelo',
  style: {fontWeight: 'bold', fontSize: '14px', margin: '0 0 6px 0'}
}));
DW_NAMES.forEach(function(nombre, i) {
  var fila = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
  fila.add(ui.Label({
    style: {backgroundColor: DW_PALETTE[i], padding: '8px', margin: '2px 6px 2px 0'}
  }));
  fila.add(ui.Label({value: nombre, style: {margin: '4px 0'}}));
  leyenda.add(fila);
});
Map.add(leyenda);
