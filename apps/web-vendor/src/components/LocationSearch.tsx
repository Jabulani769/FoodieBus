import { useEffect, useRef, useState } from 'react';
import { AutoComplete, Empty, Typography } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';

// Malawi bounding box: minLon,minLat,maxLon,maxLat
const MALAWI_BBOX = '32.67,-17.13,35.92,-9.37';

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

export interface PlaceOption {
  value: string;
  label: React.ReactNode;
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
}

export interface PlaceSuggestion {
  address?: string;
  city?: string;
}

function placeLabel(f: PhotonFeature): string {
  const p = f.properties;
  const area = p.city || p.county || p.state || p.country || '';
  return area && p.name !== area ? `${p.name} — ${area}` : (p.name ?? 'Unnamed place');
}

// The search result already knows its own names — carry them along so the
// form can suggest them without a reverse round-trip.
function placeSuggestion(f: PhotonFeature): PlaceSuggestion {
  const p = f.properties;
  const streetPart = [p.housenumber, p.street].filter(Boolean).join(' ');
  const nameBits = [streetPart, p.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  return {
    address: nameBits.join(', ') || undefined,
    city: p.city || p.county || p.state || undefined,
  };
}

export function LocationSearch({
  onSelect,
}: {
  onSelect: (latitude: number, longitude: number, label: string, place: PlaceSuggestion) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aborter = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      aborter.current?.abort();
    };
  }, []);

  const runSearch = async (text: string) => {
    aborter.current?.abort();
    const controller = new AbortController();
    aborter.current = controller;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=6&bbox=${MALAWI_BBOX}&lang=en`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`Photon responded ${res.status}`);
      const data = (await res.json()) as PhotonResponse;
      const mwOnly = (data.features ?? []).filter(
        (f) => f.properties?.countrycode === 'MW',
      );
      setOptions(
        mwOnly.map((f) => {
          const [lng, lat] = f.geometry.coordinates;
          const label = placeLabel(f);
          const suggestion = placeSuggestion(f);
          return {
            value: label,
            label,
            latitude: lat,
            longitude: lng,
            address: suggestion.address,
            city: suggestion.city,
          };
        }),
      );
      setSearched(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Place search unavailable — check your connection or drop the pin manually.');
      setOptions([]);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = (text: string) => {
    setQuery(text);
    setSearched(false);
    if (debounce.current) clearTimeout(debounce.current);
    if (text.trim().length < 3) {
      aborter.current?.abort();
      setOptions([]);
      setSearching(false);
      setError(null);
      return;
    }
    debounce.current = setTimeout(() => void runSearch(text.trim()), 400);
  };

  const handleSelect = (_value: string, option: PlaceOption) => {
    setQuery(option.value);
    setOptions([]);
    onSelect(option.latitude, option.longitude, option.value, {
      address: option.address,
      city: option.city,
    });
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <AutoComplete
        value={query}
        options={options}
        onSearch={handleSearch}
        onSelect={handleSelect}
        onChange={setQuery}
        placeholder="Search for your place — e.g. Mulanje, Limbe market… (Malawi only)"
        style={{ width: '100%' }}
        allowClear
        notFoundContent={
          searching ? null : searched && !error ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No places found in Malawi — try another name or drop the pin manually"
            />
          ) : null
        }
        popupRender={(menu) => (
          <>
            {menu}
            <div
              style={{
                padding: '4px 12px',
                borderTop: '1px solid #f0f0f0',
                color: '#98a2b3',
                fontSize: 11,
              }}
            >
              Search by Photon / OpenStreetMap — Malawi only
            </div>
          </>
        )}
      />
      {searching && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Searching Malawi…
        </Typography.Text>
      )}
      {error && (
        <Typography.Text type="danger" style={{ fontSize: 12 }}>
          {error}
        </Typography.Text>
      )}
      {!error && (
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
          <EnvironmentOutlined style={{ marginRight: 4 }} />
          Pick a result to fly the map there, then drag the pin to your exact shop.
        </Typography.Text>
      )}
    </div>
  );
}
