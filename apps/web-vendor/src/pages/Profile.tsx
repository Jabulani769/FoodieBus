import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Image,
  Input,
  InputNumber,
  Row,
  Skeleton,
  Space,
  Steps,
  Switch,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  EnvironmentOutlined,
  ExclamationCircleOutlined,
  PhoneOutlined,
  ShopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api, extractError } from '@foodiebus/api-client';
import { colors, PageHeader, cardStyle } from '@foodiebus/ui';
import { http } from '../api.js';
import { useAuth } from '@foodiebus/auth';
import { VendorLocationPicker } from '../components/VendorLocationPicker.js';

const api = new Api(http);
const { Title, Text } = Typography;

type ProfileShape = {
  businessName?: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  cuisineType?: string;
  phone?: string;
  licenseNumber?: string;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deliveryRadiusKm?: number | null;
  deliveryTime?: number | null;
  isActive?: boolean;
  isPaused?: boolean;
  storeStatus?: 'OPEN' | 'CLOSED' | 'BUSY';
  storeLabel?: string;
  isOpen?: boolean;
};

// Strip Antd `""`/null placeholders and coerce numeric strings so the backend
// never 400s on an optional url/phone/number field (the old infinite-spinner).
function sanitizeProfilePayload(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null || v === '') continue;
    if (['latitude', 'longitude', 'deliveryRadiusKm', 'deliveryTime'].includes(k)) {
      const n = typeof v === 'string' ? Number(v) : (v as number);
      if (!Number.isFinite(n)) continue;
      out[k] = n;
      continue;
    }
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) continue;
      out[k] = t;
      continue;
    }
    out[k] = v;
  }
  return out;
}

const BUSINESS_FIELDS = ['businessName', 'description', 'logoUrl', 'bannerUrl', 'cuisineType'];
const CONTACT_FIELDS = ['phone', 'licenseNumber'];

// Mirrors the backend phone regex (food.schema optionalPhone) so a bad number
// blocks inline with a clear message instead of 400ing after a spin.
const PHONE_RULE = {
  pattern: /^\+?\d{9,15}$/,
  message: 'Invalid phone number (e.g. +265991234567)',
};

// Friendly names + where each field lives, so a failed submit can point at it.
const FIELD_META: Record<string, { label: string; step: number; tab: string }> = {
  businessName: { label: 'Business name', step: 0, tab: 'business' },
  description: { label: 'Description', step: 0, tab: 'business' },
  logoUrl: { label: 'Logo URL', step: 0, tab: 'business' },
  phone: { label: 'Phone', step: 1, tab: 'business' },
  licenseNumber: { label: 'License number', step: 1, tab: 'business' },
  address: { label: 'Street / area address', step: 2, tab: 'location' },
  city: { label: 'City', step: 2, tab: 'location' },
  latitude: { label: 'Shop pin on the map', step: 2, tab: 'location' },
  longitude: { label: 'Shop pin on the map', step: 2, tab: 'location' },
  deliveryRadiusKm: { label: 'Delivery radius', step: 2, tab: 'location' },
};

interface ReversePlace {
  address?: string;
  city?: string;
}

// Best-effort: turn a pin into a human-readable address/city via Photon.
// Never throws — failures just leave the fields for manual entry.
async function reverseGeocode(latitude: number, longitude: number): Promise<ReversePlace | null> {
  try {
    const res = await fetch(
      `https://photon.komoot.io/reverse?lon=${longitude}&lat=${latitude}&lang=en`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: {
        properties?: {
          name?: string;
          street?: string;
          housenumber?: string;
          locality?: string;
          city?: string;
          county?: string;
          state?: string;
        };
      }[];
    };
    const props = data.features?.[0]?.properties;
    if (!props) return null;
    const streetPart = [props.housenumber, props.street].filter(Boolean).join(' ');
    const namePart = props.locality || (props.name && props.name !== streetPart ? props.name : '');
    const address = [streetPart, namePart].filter(Boolean).join(', ') || undefined;
    const city = props.city || props.county || props.state || undefined;
    if (!address && !city) return null;
    return { address, city };
  } catch {
    return null;
  }
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isVendor = user?.role === 'VENDOR';

  const profileKey = isVendor ? 'vendor-profile' : 'operator-profile';
  const fetchProfile = () => (isVendor ? api.getVendorProfile() : api.getOperatorProfile());
  const updateProfile = (values: object) =>
    isVendor ? api.updateVendorProfile(values) : api.updateOperatorProfile(values);

  const { data: profile, isLoading } = useQuery({
    queryKey: [profileKey],
    queryFn: fetchProfile,
    enabled: !!user,
  });

  const [form] = Form.useForm();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState('business');
  const [currentStep, setCurrentStep] = useState(0);
  // Last server-side save failure, kept visible inline (next to the form) so a
  // settled-but-failed submit can never look like a silent no-op.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Last successful save (clock time string) — durable proof it worked, since
  // a refetch after saving unchanged values renders a pixel-identical screen.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Whether the user edited anything since load/last save/reset. Programmatic
  // setFieldsValue calls don't trip onValuesChange, so this only tracks real edits.
  const [dirty, setDirty] = useState(false);
  // Freshly-uploaded filenames per asset field — the persistent "uploaded ✓"
  // proof next to each Upload button. Only set by a successful upload (never
  // for URLs that arrived with the profile), cleared on Reset.
  const [uploadedNames, setUploadedNames] = useState<{ logoUrl?: string; bannerUrl?: string }>({});
  const reverseReq = useRef(0);
  // Provenance tracking: what did WE suggest last, and what did the USER type?
  // Stale suggestions refresh on pin moves; hand-typed text is never overwritten.
  const suggestedRef = useRef<{ address?: string; city?: string }>({});
  const userEditedRef = useRef<{ address: boolean; city: boolean }>({
    address: false,
    city: false,
  });

  const p = (profile ?? {}) as ProfileShape;

  useEffect(() => {
    if (profile) {
      form.setFieldsValue(profile);
      // Loaded values count as the baseline "suggestion" — the next pin move
      // refreshes them instead of fossilizing them.
      suggestedRef.current = {
        address: p.address ?? undefined,
        city: p.city ?? undefined,
      };
      userEditedRef.current = { address: false, city: false };
      const lat = p.latitude;
      const lng = p.longitude;
      if (typeof lat === 'number' && typeof lng === 'number') {
        setLocation({ latitude: lat, longitude: lng });
        form.setFieldsValue({ latitude: lat, longitude: lng });
      } else {
        setLocation(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, form]);

  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      setSaveError(null);
      setSavedAt(new Date().toLocaleTimeString());
      setDirty(false);
      message.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: [profileKey] });
    },
    onError: (err) => {
      const e = extractError(err);
      // Toast for attention + persistent inline alert (rendered below) so the
      // failure stays visible after the toast auto-dismisses.
      setSaveError(e.message);
      message.error(e.message, 6);
      // eslint-disable-next-line no-console
      console.error('[settings] save failed:', e.code, e.message);
    },
  });

  const uploadAsset = useMutation({
    mutationFn: async ({ file, field }: { file: File; field: 'logoUrl' | 'bannerUrl' }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await http.post('/uploads?category=vendor-logos', fd);
      return { ...(res.data as { url: string }), field };
    },
    onSuccess: ({ url, field }, vars) => {
      form.setFieldValue(field, url);
      // Programmatic set — flag the change or Save stays disabled after upload.
      setDirty(true);
      setSavedAt(null);
      setUploadedNames((prev) => ({ ...prev, [field]: vars.file.name }));
      message.success('Image uploaded ✓ — Save changes to apply');
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const [hoursState, setHoursState] = useState<
    { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[]
  >([]);
  const { data: hoursData } = useQuery({
    queryKey: ['vendor-hours'],
    queryFn: () => api.getVendorHours(),
    enabled: !!user && isVendor,
  });

  useEffect(() => {
    if (hoursData?.items?.length) {
      const mapped = hoursData.items.map(
        (h: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }) => ({
          dayOfWeek: h.dayOfWeek,
          openTime: h.openTime,
          closeTime: h.closeTime,
          isClosed: h.isClosed,
        }),
      );
      setHoursState(mapped);
    } else if (hoursData && hoursState.length === 0) {
      const defaults = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        openTime: '10:00',
        closeTime: '22:00',
        isClosed: false,
      }));
      setHoursState(defaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoursData]);

  const saveHours = useMutation({
    mutationFn: (hours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed?: boolean }[]) =>
      api.updateVendorHours(hours),
    onSuccess: () => {
      message.success('Operating hours saved');
      queryClient.invalidateQueries({ queryKey: ['vendor-hours'] });
      queryClient.invalidateQueries({ queryKey: [profileKey] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  const togglePause = useMutation({
    mutationFn: (isPaused: boolean) => api.setVendorPaused(isPaused),
    onSuccess: (_res, isPaused) => {
      message.success(isPaused ? 'Store paused — Busy, not accepting orders' : 'Store resumed — accepting orders');
      queryClient.invalidateQueries({ queryKey: [profileKey] });
    },
    onError: (err) => message.error(extractError(err).message),
  });

  // Apply a suggestion to fields the user hasn't hand-edited (or that still
  // hold our previous suggestion). Returns true if anything changed.
  const applySuggestion = (patch: { address?: string; city?: string }): boolean => {
    const current = form.getFieldsValue(['address', 'city']) as {
      address?: string;
      city?: string;
    };
    const next: { address?: string; city?: string } = {};
    (['address', 'city'] as const).forEach((key) => {
      const suggested = patch[key];
      if (!suggested) return;
      const cur = current[key];
      const lastSuggested = suggestedRef.current[key];
      if (!cur || cur === lastSuggested || !userEditedRef.current[key]) {
        next[key] = suggested;
      }
    });
    if (Object.keys(next).length === 0) return false;
    form.setFieldsValue(next);
    suggestedRef.current = { ...suggestedRef.current, ...next };
    return true;
  };

  const handleLocationChange = (
    v: { latitude: number; longitude: number },
    suggestion?: { address?: string; city?: string },
  ) => {
    setLocation(v);
    form.setFieldsValue({ latitude: v.latitude, longitude: v.longitude });
    // Pin moves are programmatic (no onValuesChange) — mark dirty explicitly
    // or a pin-only change could never be saved.
    setDirty(true);
    setSavedAt(null);

    // Search results carry their own high-quality names — use them directly.
    if (suggestion && (suggestion.address || suggestion.city)) {
      if (applySuggestion(suggestion)) {
        message.info('Address suggested from your pick — adjust if needed');
      }
      return;
    }

    // Otherwise reverse-geocode the pin. Always runs (no skip-when-filled):
    // applySuggestion decides per field whether the fresh value may land.
    const req = ++reverseReq.current;
    void reverseGeocode(v.latitude, v.longitude).then((place) => {
      if (!place || reverseReq.current !== req) return;
      if (applySuggestion(place)) {
        message.info('Address suggested from your pin — adjust if needed');
      }
    });
  };

  const handleFinishFailed = (info: {
    errorFields: { name: (string | number)[]; errors: string[] }[];
  }) => {
    const names = info.errorFields.map((f) => String(f.name[f.name.length - 1]));
    const labels = [...new Set(names.map((n) => FIELD_META[n]?.label ?? n))];
    message.error(`Cannot save — missing: ${labels.join(', ')}`);
    // Jump to where the first problem lives.
    const first = FIELD_META[names[0]];
    if (first) {
      if (isFirstTime) setCurrentStep(first.step);
      else setActiveTab(first.tab);
    }
    // Also log for diagnostics.
    // eslint-disable-next-line no-console
    console.warn('[settings] submit blocked by validation:', info.errorFields);
  };

  const handleFinish = (v: Record<string, unknown>) => {
    setSaveError(null);
    setSavedAt(null);
    if (isVendor && !location) {
      message.error('Shop location is required — drop a pin on the map');
      setActiveTab('location');
      return;
    }
    // Hidden lat/lng inputs hold strings — never trust them. The map pin
    // (`location` state) is the source of truth; strip the raw form fields.
    const { latitude: _lat, longitude: _lng, ...rest } = v;
    const cleaned = sanitizeProfilePayload(rest);
    if (Object.keys(cleaned).length === 0 && !location) {
      message.warning('Nothing to save — edit a field first');
      return;
    }
    save.mutate(
      isVendor
        ? {
            ...cleaned,
            latitude: location?.latitude,
            longitude: location?.longitude,
          }
        : cleaned,
    );
  };

  const handleReset = () => {
    if (profile) {
      form.setFieldsValue(profile);
      const lat = p.latitude;
      const lng = p.longitude;
      setLocation(
        typeof lat === 'number' && typeof lng === 'number'
          ? { latitude: lat, longitude: lng }
          : null,
      );
      setDirty(false);
      setSavedAt(null);
      setUploadedNames({});
      message.info('Changes discarded');
    }
  };

  const nextStep = async (fields: string[]) => {
    try {
      await form.validateFields(fields);
      setCurrentStep((s) => s + 1);
    } catch {
      /* validation errors shown inline */
    }
  };

  const hasBusiness = !!p.businessName;
  const hasContact = !!p.phone;
  const hasPin = typeof p.latitude === 'number' && typeof p.longitude === 'number';
  const hasAddress = !!p.address && !!p.city;
  const isActive = p.isActive;

  // First-time setup: vendor missing any shop-location piece → guided stepper.
  const isFirstTime = isVendor && !!profile && !isLoading && (!hasPin || !hasAddress);

  const displayName = p.businessName || user?.fullName || '—';
  const initial = (displayName || 'U').charAt(0).toUpperCase();

  const statusRows = useMemo(() => {
    const rows = [
      {
        icon: <ShopOutlined />,
        label: 'Business details',
        done: hasBusiness,
        hint: hasBusiness ? p.businessName : 'Add your business name',
      },
      {
        icon: <PhoneOutlined />,
        label: 'Contact',
        done: hasContact,
        hint: hasContact ? p.phone : 'Add a phone number',
      },
    ];
    if (isVendor) {
      rows.push({
        icon: <EnvironmentOutlined />,
        label: 'Shop pin',
        done: hasPin && hasAddress,
        hint:
          hasPin && hasAddress
            ? [p.address, p.city].filter(Boolean).join(', ')
            : 'Drop your pin on the map',
      });
    }
    return rows;
  }, [hasBusiness, hasContact, hasPin, hasAddress, isVendor, p.businessName, p.phone, p.address, p.city]);

  const businessTab = (
    <>
      <Form.Item
        name="businessName"
        label="Business name"
        rules={[{ required: true, message: 'Business name required' }]}
      >
        <Input placeholder="Your business name" size="large" />
      </Form.Item>
      <Form.Item name="description" label="Description">
        <Input.TextArea rows={3} maxLength={500} placeholder="Short description…" />
      </Form.Item>
      <Form.Item
        name="logoUrl"
        label="Logo URL"
        rules={[{ type: 'url', message: 'Must be a valid URL (https://…)' }]}
        extra="Shown as your avatar and on the app promo card. Upload or paste https://…"
      >
        <Input placeholder="https://…" />
      </Form.Item>
      <Form.Item label="Logo">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Upload
            beforeUpload={(file) => {
              uploadAsset.mutate({ file, field: 'logoUrl' });
              return false;
            }}
            // Controlled-empty: we upload via react-query, so antd must not
            // keep the picked file in a forever-'uploading' chip.
            fileList={[]}
            maxCount={1}
            accept="image/*"
          >
            <Button icon={<UploadOutlined />} loading={uploadAsset.isPending}>
              Upload logo
            </Button>
          </Upload>
          {uploadedNames.logoUrl && (
            <Tag color="green" icon={<CheckCircleOutlined />}>
              Uploaded ✓ {uploadedNames.logoUrl}
            </Tag>
          )}
          <Form.Item noStyle shouldUpdate={(a, b) => a.logoUrl !== b.logoUrl}>
            {({ getFieldValue }) =>
              getFieldValue('logoUrl') ? (
                <Image src={getFieldValue('logoUrl')} width={96} height={96} style={{ objectFit: 'cover', borderRadius: 12 }} fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />
              ) : null
            }
          </Form.Item>
        </Space>
      </Form.Item>
      {isVendor && (
        <>
          <Form.Item
            name="bannerUrl"
            label="Banner URL"
            rules={[{ type: 'url', message: 'Must be a valid URL (https://…)' }]}
            extra="Wide cover shown on your store page"
          >
            <Input placeholder="https://…" />
          </Form.Item>
          <Form.Item label="Banner">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Upload
                beforeUpload={(file) => {
                  uploadAsset.mutate({ file, field: 'bannerUrl' });
                  return false;
                }}
                // Controlled-empty: we upload via react-query, so antd must not
                // keep the picked file in a forever-'uploading' chip.
                fileList={[]}
                maxCount={1}
                accept="image/*"
              >
                <Button icon={<UploadOutlined />} loading={uploadAsset.isPending}>
                  Upload banner
                </Button>
              </Upload>
              {uploadedNames.bannerUrl && (
                <Tag color="green" icon={<CheckCircleOutlined />}>
                  Uploaded ✓ {uploadedNames.bannerUrl}
                </Tag>
              )}
              <Form.Item noStyle shouldUpdate={(a, b) => a.bannerUrl !== b.bannerUrl}>
                {({ getFieldValue }) =>
                  getFieldValue('bannerUrl') ? (
                    <Image src={getFieldValue('bannerUrl')} style={{ borderRadius: 12, maxHeight: 160, width: '100%', objectFit: 'cover' }} fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />
                  ) : null
                }
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item name="cuisineType" label="Cuisine type">
            <Input placeholder="e.g. Malawian, Burgers, Breakfast" maxLength={120} />
          </Form.Item>
        </>
      )}
      <Divider style={{ borderColor: colors.border }} />
      <Title level={5} style={{ color: colors.text.primary, marginTop: 0 }}>
        Contact
      </Title>
      <Form.Item name="phone" label="Phone" rules={[PHONE_RULE]}>
        <Input placeholder="+265…" size="large" />
      </Form.Item>
      {!isVendor && (
        <Form.Item name="licenseNumber" label="License number">
          <Input />
        </Form.Item>
      )}
    </>
  );

  const locationTab = isVendor ? (
    <>
      {!hasPin && (
        <Alert
          type="warning"
          showIcon
          message="Shop location required"
          description="Your account cannot be approved until you set your shop pin. Fill address + city, drop the pin, then save."
          style={{ marginBottom: 16 }}
        />
      )}
      <Text type="secondary" style={{ fontSize: 13 }}>
        Only you manage this — admin cannot edit it, but approval is blocked until the pin is
        set.
      </Text>
      <Row gutter={12} style={{ marginTop: 12 }}>
        <Col xs={24} sm={14}>
          <Form.Item
            name="address"
            label="Street / area address"
            rules={[{ required: true, message: 'Shop address required' }]}
          >
            <Input
              placeholder="e.g. Shop 4, Area 47, Lilongwe"
              size="large"
              onChange={() => {
                userEditedRef.current.address = true;
              }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={10}>
          <Form.Item
            name="city"
            label="City"
            rules={[{ required: true, message: 'City required' }]}
          >
            <Input
              placeholder="e.g. Lilongwe"
              size="large"
              onChange={() => {
                userEditedRef.current.city = true;
              }}
            />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item
        label="Pin your shop on the map (required)"
        required
        validateStatus={!location ? 'error' : 'success'}
        help={!location ? 'Click on the map to drop your shop pin' : undefined}
      >
        <VendorLocationPicker value={location} onChange={handleLocationChange} height={440} />
      </Form.Item>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item
            name="deliveryRadiusKm"
            label="Delivery radius (km)"
            rules={[{ required: true, message: 'Delivery radius required' }]}
            tooltip="Customers outside this radius won't see your kitchen"
          >
            <InputNumber min={0.5} max={100} step={0.5} style={{ width: '100%' }} size="large" placeholder="e.g. 5" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="deliveryTime" label="Base prep time (mins)">
            <InputNumber min={1} max={240} style={{ width: '100%' }} size="large" placeholder="e.g. 20" />
          </Form.Item>
        </Col>
      </Row>
      {/* Hidden numeric fields so the submit carries the pin.
          Not required-validated (they're invisible) — the pin is enforced by
          handleFinish + the map hint instead, so a submit can never die silently. */}
      <Form.Item name="latitude" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name="longitude" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
    </>
  ) : null;

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const hoursTab = isVendor ? (
    <>
      <Alert
        type="info"
        showIcon
        message="Weekly schedule drives Currently Closed badging"
        description="Customers can browse while closed, but Add to Cart and checkout are locked. Use overnight spans like 18:00–02:00 where needed."
        style={{ marginBottom: 16 }}
      />
      {(hoursState.length > 0
        ? hoursState
        : [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            openTime: '10:00',
            closeTime: '22:00',
            isClosed: false,
          }))
      ).map((h, idx) => (
        <Row key={h.dayOfWeek} gutter={8} align="middle">
          <Col span={5}>
            <Text strong>{DAY_NAMES[h.dayOfWeek] ?? `Day ${h.dayOfWeek}`}</Text>
          </Col>
          <Col span={6}>
            <Input
              placeholder="10:00"
              value={h.openTime}
              onChange={(e) =>
                setHoursState((prev) => {
                  const next = [...(prev.length ? prev : [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, openTime: '10:00', closeTime: '22:00', isClosed: false })))];
                  next[idx] = { ...next[idx], openTime: e.target.value };
                  return next;
                })
              }
            />
          </Col>
          <Col span={6}>
            <Input
              placeholder="22:00"
              value={h.closeTime}
              onChange={(e) =>
                setHoursState((prev) => {
                  const next = [...(prev.length ? prev : [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, openTime: '10:00', closeTime: '22:00', isClosed: false })))];
                  next[idx] = { ...next[idx], closeTime: e.target.value };
                  return next;
                })
              }
            />
          </Col>
          <Col span={4}>
            <Switch
              checked={h.isClosed}
              checkedChildren="Closed"
              unCheckedChildren="Open"
              onChange={(checked) =>
                setHoursState((prev) => {
                  const base = prev.length
                    ? prev
                    : [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, openTime: '10:00', closeTime: '22:00', isClosed: false }));
                  const next = [...base];
                  next[idx] = { ...next[idx], isClosed: checked };
                  return next;
                })
              }
            />
          </Col>
        </Row>
      ))}
      <Button
        type="primary"
        loading={saveHours.isPending}
        style={{ marginTop: 12 }}
        onClick={() => {
          const payload =
            hoursState.length > 0
              ? hoursState
              : [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, openTime: '10:00', closeTime: '22:00', isClosed: false }));
          // Inline HH:mm gate — the old code sent raw input and the whole save
          // spun until the backend 400'd with no row highlighted.
          const bad = payload.find(
            (h) => !/^([01]\d|2[0-3]):([0-5]\d)$/.test(h.openTime) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(h.closeTime),
          );
          if (bad) {
            message.error(`Day ${DAY_NAMES[bad.dayOfWeek]} times must be HH:mm (24h), e.g. 10:00`);
            return;
          }
          saveHours.mutate(payload);
        }}
      >
        Save hours
      </Button>
    </>
  ) : null;

  const statusTab = isVendor ? (
    <Card size="small" style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>
            {p.storeStatus === 'OPEN' ? 'Open — accepting orders' : (p.storeLabel ?? 'Closed')}
          </div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Emergency pause instantly suspends incoming tickets during rushes. Customers see
            “Busy - Not Accepting Orders” but can still browse.
          </Text>
        </div>
        <Switch
          checked={!!p.isPaused}
          loading={togglePause.isPending}
          checkedChildren="Paused"
          unCheckedChildren="Open"
          onChange={(checked) => togglePause.mutate(checked)}
        />
      </div>
      <Divider style={{ margin: '12px 0' }} />
      <Space>
        <Tag color={p.storeStatus === 'OPEN' ? 'green' : p.storeStatus === 'BUSY' ? 'orange' : 'red'}>
          {p.storeStatus ?? (p.isActive ? 'OPEN' : 'CLOSED')}
        </Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {p.deliveryRadiusKm ? `Delivery within ${p.deliveryRadiusKm} km` : 'Set delivery radius in Shop location'}
        </Text>
      </Space>
    </Card>
  ) : null;

  return (
    <>
      <PageHeader
        title="Profile & Settings"
        subtitle="Manage your business profile and account details"
        extra={
          isVendor && !!profile ? (
            <Tag color={hasPin ? 'green' : 'orange'}>
              {hasPin ? 'Location set' : 'Location missing'}
            </Tag>
          ) : undefined
        }
      />

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={8}>
          <Card style={cardStyle}>
            {p.bannerUrl && (
              <Image
                src={p.bannerUrl}
                preview={false}
                style={{ borderRadius: 12, marginBottom: 12, maxHeight: 140, width: '100%', objectFit: 'cover' }}
                fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
              />
            )}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <Avatar
                size={88}
                src={p.logoUrl || undefined}
                style={{ backgroundColor: colors.primary, fontSize: 36, fontWeight: 600 }}
              >
                {initial}
              </Avatar>
              <Title level={4} style={{ margin: '16px 0 4px', color: colors.text.primary }}>
                {displayName}
              </Title>
              <Tag color="blue" style={{ marginBottom: 4 }}>
                {user?.role ?? '—'}
              </Tag>
              <Text type="secondary">{user?.email}</Text>
            </div>
          </Card>

          <Card title="Setup status" style={{ ...cardStyle, marginTop: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {statusRows.map((row) => (
                <div key={row.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      color: row.done ? colors.success : colors.warning,
                      fontSize: 16,
                      lineHeight: 1.4,
                    }}
                  >
                    {row.done ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
                  </span>
                  <div>
                    <div style={{ fontWeight: 500, color: colors.text.primary }}>{row.label}</div>
                    <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                      {row.hint}
                    </Text>
                  </div>
                </div>
              ))}
            </div>
            <Divider style={{ borderColor: colors.border }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Approval
              </Text>
              {isActive ? (
                <Tag color="green">Active</Tag>
              ) : (
                <Tag color="orange">Pending{isVendor && !hasPin ? ' — set shop pin' : ''}</Tag>
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleFinish}
            onFinishFailed={handleFinishFailed}
            onValuesChange={() => {
              setDirty(true);
              setSavedAt(null);
            }}
            disabled={!profile}
          >
            <Skeleton loading={isLoading} active paragraph={{ rows: 6 }}>
              {isFirstTime ? (
                <Card
                  title="Set up your shop"
                  extra={<Tag color="orange">Step {currentStep + 1} of 3</Tag>}
                  style={cardStyle}
                >
                  <Steps
                    current={currentStep}
                    size="small"
                    style={{ marginBottom: 24 }}
                    items={[
                      { title: 'Business', icon: <ShopOutlined /> },
                      { title: 'Contact', icon: <PhoneOutlined /> },
                      { title: 'Location', icon: <EnvironmentOutlined /> },
                    ]}
                  />
                  {saveError && (
                    <Alert
                      type="error"
                      showIcon
                      message="Could not save — fix and retry"
                      description={saveError}
                      style={{ marginBottom: 16 }}
                      closable
                      onClose={() => setSaveError(null)}
                    />
                  )}
                  {currentStep === 0 && (
                    <>
                      <Form.Item
                        name="businessName"
                        label="Business name"
                        rules={[{ required: true, message: 'Business name required' }]}
                      >
                        <Input placeholder="Your business name" size="large" autoFocus />
                      </Form.Item>
                      <Form.Item name="description" label="Description">
                        <Input.TextArea
                          rows={3}
                          maxLength={500}
                          placeholder="Short description…"
                        />
                      </Form.Item>
                      <Form.Item
                        name="logoUrl"
                        label="Logo URL"
                        rules={[{ type: 'url', message: 'Must be a valid URL (https://…)' }]}
                      >
                        <Input placeholder="https://…" />
                      </Form.Item>
                      {isVendor && (
                        <>
                          <Form.Item
                            name="bannerUrl"
                            label="Banner URL"
                            rules={[{ type: 'url', message: 'Must be a valid URL' }]}
                          >
                            <Input placeholder="https://…" />
                          </Form.Item>
                          <Form.Item name="cuisineType" label="Cuisine type">
                            <Input placeholder="e.g. Burgers" maxLength={120} />
                          </Form.Item>
                        </>
                      )}
                    </>
                  )}
                  {currentStep === 1 && (
                    <Form.Item name="phone" label="Phone" rules={[PHONE_RULE]}>
                      <Input placeholder="+265…" size="large" autoFocus />
                    </Form.Item>
                  )}
                  {currentStep === 2 && locationTab}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: 16,
                    }}
                  >
                    <Button disabled={currentStep === 0} onClick={() => setCurrentStep((s) => s - 1)}>
                      Back
                    </Button>
                    {currentStep < 2 ? (
                      <Button
                        type="primary"
                        onClick={() =>
                          nextStep(currentStep === 0 ? BUSINESS_FIELDS : CONTACT_FIELDS)
                        }
                      >
                        Continue
                      </Button>
                    ) : (
                      <Button type="primary" htmlType="submit" loading={save.isPending}>
                        Complete setup
                      </Button>
                    )}
                  </div>
                </Card>
              ) : (
                <>
                  <Card style={cardStyle}>
                    {saveError && (
                      <Alert
                        type="error"
                        showIcon
                        message="Could not save — fix and retry"
                        description={saveError}
                        style={{ marginBottom: 16 }}
                        closable
                        onClose={() => setSaveError(null)}
                      />
                    )}
                    {savedAt && !saveError && (
                      <Alert
                        type="success"
                        showIcon
                        message={`All changes saved ✓ at ${savedAt}`}
                        style={{ marginBottom: 16 }}
                        closable
                        onClose={() => setSavedAt(null)}
                      />
                    )}
                    {isVendor ? (
                      <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={[
                          { key: 'business', label: 'Business', children: businessTab },
                          {
                            key: 'location',
                            label: (
                              <span>
                                Shop location{' '}
                                {!hasPin && (
                                  <Badge dot style={{ marginLeft: 2 }} />
                                )}
                              </span>
                            ),
                            children: locationTab,
                          },
                          { key: 'hours', label: 'Operating hours', children: hoursTab },
                          { key: 'status', label: 'Store status', children: statusTab },
                        ]}
                      />
                    ) : (
                      businessTab
                    )}
                  </Card>
                  <div className="settings-save-bar">
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {save.isError
                        ? 'Save failed — see the error above, fix the highlighted field, retry.'
                        : save.isPending
                          ? 'Saving…'
                          : savedAt
                            ? `All changes saved ✓ at ${savedAt}.`
                            : !dirty
                              ? 'No changes to save — edit a field first.'
                              : location || !isVendor
                                ? 'Review your details, then save.'
                                : 'Drop your shop pin before saving.'}
                    </Text>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button onClick={handleReset} disabled={save.isPending}>
                        Reset
                      </Button>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={save.isPending}
                        disabled={save.isPending || !dirty}
                      >
                        Save changes
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Skeleton>
          </Form>
        </Col>
      </Row>
    </>
  );
}
