import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Tag, Tooltip, Typography } from 'antd';
import {
  AimOutlined,
  CopyOutlined,
  EnvironmentOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationSearch, type PlaceSuggestion } from './LocationSearch.js';

export const MALAWI_CENTER: [number, number] = [-13.9626, 33.7741];
export const MALAWI_ZOOM = 6;
export const SHOP_ZOOM = 15;

// Fix default marker images under Vite (no bundler file-loader for leaflet pngs).
const defaultIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export type LatLng = { latitude: number; longitude: number };

function ClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

// Leaflet measures its container at mount time. When the map starts out hidden
// (inactive tab / later stepper step), it measures 0x0 and stays blank blue.
// Re-measure as soon as the container becomes visible.
function FixHiddenMap() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const fix = () => {
      // let layout settle first (tab panes animate in)
      setTimeout(() => map.invalidateSize(), 80);
    };
    fix();
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) fix();
    });
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [map]);
  return null;
}

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

// If the browser can't load the primary tiles (blocker, firewall, OSM
// throttling), automatically fall over to the backup provider instead of
// leaving a blue rectangle.
function ResilientTileLayer({ onFallback }: { onFallback: () => void }) {
  const [index, setIndex] = useState(0);
  const errors = useRef(0);
  const map = useMap();

  useEffect(() => {
    const handleTileError = () => {
      errors.current += 1;
      if (errors.current >= 6 && index < TILE_PROVIDERS.length - 1) {
        errors.current = 0;
        setIndex((i) => i + 1);
        onFallback();
      }
    };
    map.on('tileerror', handleTileError);
    return () => {
      map.off('tileerror', handleTileError);
    };
  }, [map, index, onFallback]);

  const p = TILE_PROVIDERS[index];
  return <TileLayer key={p.name} url={p.url} subdomains={p.subdomains} attribution={p.attribution} />;
}

export function VendorLocationPicker({
  value,
  onChange,
  height = 440,
}: {
  value: LatLng | null;
  onChange: (v: LatLng, suggestion?: PlaceSuggestion) => void;
  height?: number;
}) {
  const center: [number, number] = useMemo(
    () => (value ? [value.latitude, value.longitude] : MALAWI_CENTER),
    [value],
  );
  const zoom = value ? SHOP_ZOOM : MALAWI_ZOOM;
  const [usingBackupTiles, setUsingBackupTiles] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('This device has no location support — search for your place above instead.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setAccuracy(pos.coords.accuracy ?? null);
        onChange({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        if (err.code === 1) {
          setGeoError(
            'Location blocked — allow it in the browser address bar, or search for your place above.',
          );
        } else if (err.code === 3) {
          setGeoError('Location request timed out — try again or search for your place above.');
        } else {
          setGeoError(
            'Could not determine location on this device — search for your place above instead. (Laptops often resolve to the nearest network hub, e.g. Blantyre.)',
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSearchSelect = (
    latitude: number,
    longitude: number,
    _label: string,
    place: PlaceSuggestion,
  ) => {
    setGeoError(null);
    setAccuracy(null);
    onChange({ latitude, longitude }, place);
  };

  const copyCoords = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(`${value.latitude}, ${value.longitude}`);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const coordText = value
    ? `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`
    : null;

  return (
    <div>
      <LocationSearch onSelect={handleSearchSelect} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <Button
          size="small"
          icon={<AimOutlined />}
          onClick={useMyLocation}
          loading={locating}
        >
          Use my location
        </Button>
        {usingBackupTiles && (
          <Tooltip title="OpenStreetMap tiles failed to load in this browser, so a backup map is shown. Your pin still saves the same coordinates.">
            <Tag icon={<WarningOutlined />} color="orange" style={{ fontSize: 12 }}>
              Backup map
            </Tag>
          </Tooltip>
        )}
        {coordText ? (
          <Tooltip title="Click to copy coordinates">
            <Tag
              icon={<EnvironmentOutlined />}
              color="blue"
              onClick={copyCoords}
              style={{ cursor: 'pointer', fontSize: 12, padding: '3px 10px' }}
            >
              {coordText} <CopyOutlined style={{ marginLeft: 4 }} />
            </Tag>
          </Tooltip>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Click on the map to drop your shop pin — you can drag it afterwards to fine-tune
          </Typography.Text>
        )}
      </div>
      {geoError && (
        <Typography.Text type="danger" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          {geoError}
        </Typography.Text>
      )}
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height, width: '100%', borderRadius: 8, zIndex: 0 }}
        scrollWheelZoom
      >
        <ResilientTileLayer onFallback={() => setUsingBackupTiles(true)} />
        <FixHiddenMap />
        <ClickHandler
          onPick={(lat, lng) => {
            setAccuracy(null);
            onChange({ latitude: lat, longitude: lng });
          }}
        />
        <Recenter center={center} zoom={zoom} />
        {value && (
          <>
            <Marker
              position={[value.latitude, value.longitude]}
              icon={defaultIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const ll = m.getLatLng();
                  setAccuracy(null);
                  onChange({ latitude: ll.lat, longitude: ll.lng });
                },
              }}
            />
            {typeof accuracy === 'number' && (
              <Circle
                center={[value.latitude, value.longitude]}
                radius={accuracy}
                pathOptions={{
                  color: '#1677ff',
                  weight: 1,
                  opacity: 0.6,
                  fillOpacity: 0.12,
                }}
              />
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
}
