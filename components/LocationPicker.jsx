import { useEffect, useState, useMemo } from 'react';

const GN_USER = process.env.NEXT_PUBLIC_GEONAMES_USERNAME || 'demo';

// ---- tiny cache in sessionStorage (speeds up dropdowns) ----
function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (expiry && Date.now() > expiry) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch { return null; }
}
function cacheSet(key, data, ttlMs = 60 * 60 * 1000) { // 1 hour
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + ttlMs }));
  } catch {}
}
async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export default function LocationPicker({ onSelect }) {
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [countryCode, setCountryCode] = useState('');
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  // Load countries (cached)
  useEffect(() => {
    (async () => {
      setLoadingCountries(true);
      const cacheKey = 'gn:countries';
      const c = cacheGet(cacheKey);
      if (c) {
        setCountries(c);
        setLoadingCountries(false);
        return;
      }
      try {
        const r = await fetchWithTimeout(`https://secure.geonames.org/countryInfoJSON?username=${GN_USER}`, 10000);
        const j = await r.json();
        const list = (j?.geonames || [])
          .map(x => ({ id: x.geonameId, code: x.countryCode, name: x.countryName }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setCountries(list);
        cacheSet(cacheKey, list);
      } catch (e) {
        console.error('GeoNames countries fail:', e);
      }
      setLoadingCountries(false);
    })();
  }, []);

  // Load major cities when a country is picked (cached + smaller dataset)
  async function loadCities(cc) {
    setCountryCode(cc);
    setCities([]);
    if (!cc) return;
    const cacheKey = `gn:cities:${cc}`;
    const c = cacheGet(cacheKey);
    if (c) {
      setCities(c);
      return;
    }
    setLoadingCities(true);
    try {
      // Restrict to major populated places for speed:
      // featureClass=P and featureCode=PPLC (capital), PPLA (admin capital), PPLA2 (sub-admin)
      const url =
        `https://secure.geonames.org/searchJSON?username=${GN_USER}` +
        `&country=${cc}&featureClass=P&featureCode=PPLC&featureCode=PPLA&featureCode=PPLA2` +
        `&orderby=population&maxRows=80`;
      const r = await fetchWithTimeout(url, 10000);
      const j = await r.json();
      const list = (j?.geonames || []).map(g => ({
        id: g.geonameId,
        name: `${g.name}${g.adminName1 ? ', ' + g.adminName1 : ''}`,
        lat: +g.lat, lng: +g.lng, population: g.population || null
      }));
      setCities(list);
      cacheSet(cacheKey, list, 6 * 60 * 60 * 1000); // 6 hours
    } catch (e) {
      console.error('GeoNames cities fail:', e);
    }
    setLoadingCities(false);
  }

  return (
    <div style={{display:'flex', flexDirection:'column', gap:12}}>
      {/* Line 1: Country */}
      <div>
        <label className="block text-sm mb-1">Country</label>
        <select
          className="input"
          style={{minWidth: 320}}
          onChange={e=>loadCities(e.target.value)}
          value={countryCode}
        >
          <option value="">{loadingCountries ? 'Loading countries…' : 'Select country'}</option>
          {countries.map(c=>(
            <option key={c.id} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Line 2: City */}
      <div>
        <label className="block text-sm mb-1">City</label>
        <select
          className="input"
          style={{minWidth: 320}}
          disabled={!countryCode || loadingCities}
          onChange={e=>{
            const found = cities.find(c=>String(c.id)===e.target.value);
            if (found) onSelect(found);
          }}
          defaultValue=""
        >
          <option value="">
            {!countryCode ? 'Select a country first' : loadingCities ? 'Loading cities…' : 'Select a city'}
          </option>
          {cities.map(c=>(
            <option key={c.id} value={c.id}>
              {c.name}{c.population ? ` (${c.population.toLocaleString()})` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
