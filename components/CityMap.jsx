import dynamic from 'next/dynamic';
import { useMemo } from 'react';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr:false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr:false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr:false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr:false });

export default function CityMap({ lat, lng, label }){
  const center = useMemo(()=>[lat, lng],[lat,lng]);
  if(typeof lat !== 'number' || typeof lng !== 'number') return null;
  return (
    <div className="mapwrap card">
      <MapContainer center={center} zoom={9} style={{height:'100%', width:'100%', borderRadius:12}} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker center={center} radius={10}>
          <Popup>{label || 'Selected city'}</Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
