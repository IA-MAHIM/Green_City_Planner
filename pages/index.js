import { useState, useEffect } from 'react';
import LocationPicker from '@/components/LocationPicker';
import { useRouter } from 'next/router';
import { warmCityCache } from '@/lib/dataProviders';

export default function Home(){
  const [city, setCity] = useState(null);
  const router = useRouter();

  function openNewTab(path){
    window.open(path, '_blank', 'noopener,noreferrer');
  }

  // Prefetch city data once selected
  useEffect(()=>{
    if (!city) return;
    warmCityCache(city.lat, city.lng);
  }, [city]);

  return (
    <div className="container">
      <header className="header" style={{justifyContent:'center'}}>
        <div className="brand" style={{textAlign:'center', fontSize:'2.2rem'}}>
          Green City Planner & Healthy Settlements
        </div>
      </header>

      <div className="content-wrap" style={{justifyContent:'center'}}>
        <div className="card" style={{flex:'1 1 100%', maxWidth:800, textAlign:'center'}}>
          <div style={{display:'flex', gap:16, justifyContent:'center', marginBottom:20}}>
            <button onClick={()=>openNewTab('/about-website.jpg')}>About the website</button>
            <button onClick={()=>openNewTab('/about-team.jpg')}>About the team</button>
          </div>
        </div>

        <div className="card" style={{flex:'1 1 100%', maxWidth:600, textAlign:'center'}}>
          <h2 style={{marginTop:0, marginBottom:20}}>Select a location</h2>

          {/* Only ONE LocationPicker (handles both Country + City) */}
          <LocationPicker onSelect={(c)=>setCity(c)} />

          <div style={{marginTop:20}}>
            <button
              className="primary"
              disabled={!city}
              onClick={()=>router.push(`/analysis?lat=${city.lat}&lng=${city.lng}&name=${encodeURIComponent(city.name)}`)}
              style={{fontSize:18, padding:'12px 22px', borderRadius:14}}
            >
              Analyze
            </button>
          </div>
        </div>
      </div>

      <div className="footer">© {new Date().getFullYear()} Green City Planner & Healthy Settlements</div>
    </div>
  );
}
