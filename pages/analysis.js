import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import IndicatorsPanel from '@/components/IndicatorsPanel';

const CityMap = dynamic(() => import('@/components/CityMap'), { ssr: false });

export default function AnalysisPage() {
  const router = useRouter();
  const { lat, lng, name } = router.query;

  const city = lat && lng
    ? { lat: parseFloat(lat), lng: parseFloat(lng), name: decodeURIComponent(name || '') }
    : null;

  function backToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="container">
      <div className="content-wrap" style={{ justifyContent: 'center' }}>
        <div className="card" style={{ width: '100%', maxWidth: 1000, margin: '0 auto', padding: 20 }}>
          
          {/* Header inside the card */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <button
              onClick={() => router.push('/')}
              style={{ padding: '6px 12px', fontSize: 14, borderRadius: 8, marginRight: 'auto' }}
            >
              ← Back
            </button>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 30, fontWeight: 800 }}>
              City Dashboard — {city?.name || '—'}
            </div>
            <div style={{ width: 60 }} /> {/* spacer */}
          </div>

          {/* Map */}
          {city ? (
            <>
              <h3 style={{ marginTop: 0, marginBottom: 6, textAlign: 'center' }}>Map</h3>
              <div className="mapwrap" style={{ marginTop: 0, marginBottom: 10 }}>
                <CityMap lat={city.lat} lng={city.lng} label={city.name} />
              </div>

              {/* Compact data sources directly under the map */}
              <div className="card" style={{ marginTop: 0, marginBottom: 8 }}>
                <h4 style={{ margin: '0 0 8px' }}>Data sources</h4>
                <div className="grid-3">
                  <div className="kpi"><div>NASA Earth Imagery</div><div><b>api.nasa.gov/planetary/earth/imagery</b></div></div>
                  <div className="kpi"><div>Weather & Air</div><div><b>open-meteo.com</b></div></div>
                  <div className="kpi"><div>Wildfires</div><div><b>NASA EONET</b></div></div>
                </div>
              </div>

              {/* Indicators (compact spacing) */}
              <IndicatorsPanel city={city} hideTop compact />

              {/* Bottom actions */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 14 }}>
                <button
                  className="primary"
                  onClick={() =>
                    router.push(
                      `/solution?lat=${city.lat}&lng=${city.lng}&name=${encodeURIComponent(city.name || '')}`
                    )
                  }
                  style={{ fontSize: 18, padding: '12px 24px', borderRadius: 14 }}
                >
                  Go to Solutions
                </button>
                <button
                  onClick={backToTop}
                  style={{ padding: '10px 16px', borderRadius: 12 }}
                >
                  ↑ Back to Top
                </button>
              </div>
            </>
          ) : (
            <div>Select a city first.</div>
          )}
        </div>
      </div>
    </div>
  );
}
