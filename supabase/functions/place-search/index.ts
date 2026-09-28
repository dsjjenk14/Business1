/**
 * Place search for "Where?" boxes: restaurants, bars, parks and
 * neighborhoods near you, as you type. Uses Photon, a free OpenStreetMap
 * search made for type-ahead (no key, no cost; please keep use fair).
 * Results are biased to where you are: the phone's approximate location, or
 * your area on I'm In if the phone didn't send one.
 *
 * POST { q, lat?, lng? } → { places: Place[] }   (signed-in members only)
 */
import { adminRest, corsHeaders, getCaller, json } from '../_shared/http.ts';

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    locality?: string;
    city?: string;
    state?: string;
    type?: string;
  };
};

// Overridable only so tests can point at a local stand-in.
const PHOTON_URL = Deno.env.get('PHOTON_URL') ?? 'https://photon.komoot.io/api/';
const PLACE_KEYS = new Set(['amenity', 'leisure', 'tourism', 'shop', 'building', 'historic', 'sport', 'club', 'craft']);
const AREA_VALUES = new Set(['neighbourhood', 'suburb', 'quarter', 'city', 'town', 'village', 'hamlet']);
const MAX_MILES = 60;

function miles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await getCaller(req);
  if (!caller) return json({ error: 'Sign in first.' }, 401);

  let q = '';
  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const body = await req.json();
    q = String(body?.q ?? '').trim().slice(0, 80);
    if (Number.isFinite(body?.lat) && Number.isFinite(body?.lng)) {
      lat = Number(body.lat);
      lng = Number(body.lng);
    }
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  if (q.length < 2) return json({ places: [] });

  // No location from the phone: use the member's area.
  if (lat == null || lng == null) {
    const { data } = await adminRest<{ lat: number; lng: number } | null>('rpc/search_origin', { method: 'POST', body: { p_user: caller.id } });
    if (data && Number.isFinite(data.lat)) {
      lat = data.lat;
      lng = data.lng;
    }
  }

  const params = new URLSearchParams({ q, limit: '15', lang: 'en' });
  if (lat != null && lng != null) {
    params.set('lat', String(lat));
    params.set('lon', String(lng));
    params.set('location_bias_scale', '0.1');
  }
  let features: PhotonFeature[] = [];
  try {
    const res = await fetch(`${PHOTON_URL}?${params}`, { headers: { Accept: 'application/json', 'User-Agent': "I'm In (imin-dc.expo.app)" } });
    if (!res.ok) return json({ error: 'Place search isn’t available right now.' }, 502);
    features = ((await res.json()) as { features?: PhotonFeature[] }).features ?? [];
  } catch {
    return json({ error: 'Place search isn’t available right now.' }, 502);
  }

  // Photon already ranks by match and nearness; keep its order.
  const seen = new Set<string>();
  const places = features
    .map((f) => {
      const p = f.properties ?? {};
      const [pLng, pLat] = f.geometry?.coordinates ?? [NaN, NaN];
      if (!p.name || !Number.isFinite(pLat) || !Number.isFinite(pLng) || !p.osm_id || !p.osm_type) return null;
      const isArea = p.osm_key === 'place' && AREA_VALUES.has(p.osm_value ?? '');
      if (!isArea && !PLACE_KEYS.has(p.osm_key ?? '')) return null;
      const distance = lat != null && lng != null ? miles(lat, lng, pLat, pLng) : null;
      if (distance != null && distance > MAX_MILES) return null;
      return {
        osm_id: `${p.osm_type}${p.osm_id}`,
        name: p.name,
        kind: isArea ? ('area' as const) : ('place' as const),
        category: p.osm_value ?? null,
        address: [p.housenumber, p.street].filter(Boolean).join(' ') || null,
        neighborhood: p.district ?? p.locality ?? (isArea ? p.city : null) ?? null,
        city: p.city ?? null,
        lat: pLat,
        lng: pLng,
        distance_mi: distance != null ? Math.round(distance * 10) / 10 : null,
      };
    })
    .filter((p): p is NonNullable<typeof p> => {
      if (!p) return false;
      const key = `${p.name}|${p.address ?? ''}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
  return json({ places });
});
