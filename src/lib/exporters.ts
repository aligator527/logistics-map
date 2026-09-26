// Exports: GeoJSON and KML (lon/lat, for GIS and Google Earth) and a PNG of the map.
export interface ExportPoint { name: string; lon: number; lat: number; props?: Record<string, string | number | null> }

function download(name: string, type: string, body: BlobPart) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function geojson(points: ExportPoint[]) {
  return JSON.stringify({ type: 'FeatureCollection', features: points.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { name: p.name, ...p.props } })) });
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function kml(title: string, points: ExportPoint[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(title)}</name>${points.map((p) =>
    `<Placemark><name>${esc(p.name)}</name>${p.props ? `<ExtendedData>${Object.entries(p.props).map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(String(v ?? ''))}</value></Data>`).join('')}</ExtendedData>` : ''}<Point><coordinates>${p.lon},${p.lat}</coordinates></Point></Placemark>`).join('')}</Document></kml>`;
}
export function saveGeo(base: string, title: string, points: ExportPoint[], fmt: 'geojson' | 'kml') {
  if (fmt === 'geojson') download(`${base}.geojson`, 'application/geo+json', geojson(points));
  else download(`${base}.kml`, 'application/vnd.google-earth.kml+xml', kml(title, points));
}
// SVG presentation properties copied from the computed style, so the exported image looks like the screen
const PROPS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap',
  'opacity', 'display', 'visibility', 'vector-effect', 'font-family', 'font-size', 'font-weight', 'paint-order', 'text-anchor', 'dominant-baseline'];
function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  (dst as SVGElement).setAttribute('style', PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
  for (let i = 0; i < src.children.length; i++) inlineStyles(src.children[i], dst.children[i]);
}
async function svgImage(svg: SVGSVGElement, w: number, h: number) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
/** the map area as a PNG: map tiles and the 1 km raster (canvases) and the map's SVG layers, as on screen */
export async function savePng(el: HTMLElement, base: string) {
  const box = el.getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = Math.round(box.width * k); cv.height = Math.round(box.height * k);
  const ctx = cv.getContext('2d')!;
  ctx.scale(k, k);
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
  ctx.fillRect(0, 0, box.width, box.height);
  // in paint order: tiles (z 0), the map SVG, the raster, the point overlay
  const layers = [...el.querySelectorAll<HTMLElement | SVGSVGElement>(':scope > canvas, :scope > svg')]
    .sort((a, b) => (Number(getComputedStyle(a).zIndex) || 0) - (Number(getComputedStyle(b).zIndex) || 0));
  for (const node of layers) {
    const r = node.getBoundingClientRect(), x = r.left - box.left, y = r.top - box.top;
    if (node instanceof HTMLCanvasElement) {
      ctx.save();
      const f = getComputedStyle(node).filter;
      if (f && f !== 'none') ctx.filter = f;
      ctx.globalAlpha = Number(getComputedStyle(node).opacity) || 1;
      ctx.drawImage(node, x, y, r.width, r.height);
      ctx.restore();
    } else {
      ctx.drawImage(await svgImage(node as SVGSVGElement, r.width, r.height), x, y, r.width, r.height);
    }
  }
  const a = Object.assign(document.createElement('a'), { href: cv.toDataURL('image/png'), download: `${base}.png` });
  document.body.appendChild(a); a.click(); a.remove();
}
