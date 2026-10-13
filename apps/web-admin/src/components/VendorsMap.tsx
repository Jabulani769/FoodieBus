import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export const MALAWI_CENTER: [number, number] = [-13.9626, 33.7741];

const icon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export type VendorPin = {
  id: string;
  businessName: string;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
};

const TILE_PROVIDERS = [
  {
    name: 'osm',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    name: 'carto',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
];

// Same safeguard as the vendor picker: fall over to backup tiles instead of a
// blank blue rectangle when the primary tiles fail in the browser.
function ResilientTileLayer() {
  const [index, setIndex] = useState(0);
  const errors = useRef(0);
  const map = useMap();

  useEffect(() => {
    const handleTileError = () => {
      errors.current += 1;
      if (errors.current >= 6 && index < TILE_PROVIDERS.length - 1) {
        errors.current = 0;
        setIndex((i) => i + 1);
      }
    };
    map.on('tileerror', handleTileError);
    return () => {
      map.off('tileerror', handleTileError);
    };
  }, [map, index]);

  const p = TILE_PROVIDERS[index];
  return <TileLayer key={p.name} url={p.url} subdomains={p.subdomains} attribution={p.attribution} />;
}

export function VendorsMap({ vendors }: { vendors: VendorPin[] }) {
  const pins = useMemo(
    () =>
      vendors.filter(
        (v): v is VendorPin & { latitude: number; longitude: number } =>
          typeof v.latitude === 'number' && typeof v.longitude === 'number',
      ),
    [vendors],
  );

  const center: [number, number] = useMemo(() => {
    if (pins.length === 0) return MALAWI_CENTER;
    const lat = pins.reduce((s, p) => s + p.latitude, 0) / pins.length;
    const lng = pins.reduce((s, p) => s + p.longitude, 0) / pins.length;
    return [lat, lng];
  }, [pins]);

  return (
    <MapContainer
      center={center}
      zoom={pins.length === 0 ? 6 : 7}
      style={{ height: 340, width: '100%', borderRadius: 8, zIndex: 0 }}
      scrollWheelZoom
    >
      <ResilientTileLayer />
      {pins.map((v) => (
        <Marker key={v.id} position={[v.latitude, v.longitude]} icon={icon}>
          <Popup>
            <strong>{v.businessName}</strong>
            <br />
            {[v.address, v.city].filter(Boolean).join(', ') || 'No address'}
            <br />
            {v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}
            <br />
            {v.isActive ? 'Active' : 'Inactive / pending'}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
