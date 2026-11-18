'use client';

import { useEffect, useMemo } from 'react';
import { APIProvider, AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps';
import { decodePolyline } from '@/lib/client';
import type { Me, MyTrip, Plan, PublicPerson } from '@/lib/types';

interface Props {
  apiKey: string;
  mapId: string;
  plan: Plan;
  me: Me | null;
  people: PublicPerson[];
  trip: MyTrip | null;
  focusId: string | null;
  panelOpen: boolean;
  onSelectVenue: (placeId: string) => void;
}

export default function HostingMap(props: Props) {
  if (!props.apiKey) {
    return <div className="mapmissing">The map needs GOOGLE_MAPS_BROWSER_KEY in the server settings.</div>;
  }
  return (
    <APIProvider apiKey={props.apiKey}>
      <Map
        mapId={props.mapId}
        defaultCenter={{ lat: 43.6532, lng: -79.3832 }}
        defaultZoom={11}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        style={{ width: '100%', height: '100%' }}
      >
        <Layers {...props} />
      </Map>
    </APIProvider>
  );
}

function Layers({ plan, me, people, trip, focusId, panelOpen, onSelectVenue }: Props) {
  const map = useMap();
  const top = plan.venues.slice(0, 8);
  const selected = plan.venues.find((v) => v.placeId === plan.selectedPlaceId) ?? null;
  const myColor = people.find((p) => p.id === me?.id)?.color ?? '#1f2430';
  const home = me && me.shareLocation ? me.location : null; // your pin only while "Use my address" is on

  // Your route only. Nobody else's route is ever drawn, because it would reveal their home.
  useEffect(() => {
    if (!map || !trip?.polyline) return;
    const path = decodePolyline(trip.polyline);
    const dashed = trip.mode === 'walk' || trip.mode === 'transit';
    const casing = new google.maps.Polyline({ path, map, strokeColor: '#ffffff', strokeOpacity: 1, strokeWeight: 9, zIndex: 1 });
    const line = new google.maps.Polyline({
      path,
      map,
      strokeColor: myColor,
      strokeOpacity: dashed ? 0 : 1,
      strokeWeight: 5,
      zIndex: 2,
      icons: dashed ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeWeight: 4, scale: 3 }, offset: '0', repeat: '14px' }] : undefined,
    });
    return () => {
      casing.setMap(null);
      line.setMap(null);
    };
  }, [map, trip?.polyline, trip?.mode, myColor]);

  // Fit what matters to you: home, route, midpoint, top picks.
  const fitKey = useMemo(
    () =>
      JSON.stringify([home, plan.midpoint, top.map((v) => v.placeId), trip?.polyline?.length ?? 0, trip?.pickups?.length ?? 0, panelOpen]),
    [home, plan.midpoint, top, trip?.polyline, trip?.pickups, panelOpen],
  );
  useEffect(() => {
    if (!map) return;
    const b = new google.maps.LatLngBounds();
    if (home) b.extend(home);
    if (plan.midpoint) b.extend(plan.midpoint);
    top.forEach((v) => b.extend(v.location));
    if (selected) b.extend(selected.location);
    trip?.pickups?.forEach((p) => b.extend(p.location));
    if (trip?.polyline) decodePolyline(trip.polyline).forEach((p) => b.extend(p));
    if (b.isEmpty()) return;
    const wide = typeof window !== 'undefined' && window.innerWidth > 760;
    map.fitBounds(b, { top: 70, left: 40, bottom: 80, right: wide && panelOpen ? 400 : 40 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);

  useEffect(() => {
    const v = plan.venues.find((x) => x.placeId === focusId);
    if (map && v) map.panTo(v.location);
  }, [map, focusId, plan.venues]);

  return (
    <>
      {plan.midpoint && (
        <AdvancedMarker position={plan.midpoint} title="Fair midpoint" zIndex={5}>
          <div className="m-mid" />
        </AdvancedMarker>
      )}
      {top.map((v, i) => {
        const isSel = v.placeId === plan.selectedPlaceId;
        return (
          <AdvancedMarker key={v.placeId} position={v.location} title={v.name} zIndex={isSel ? 30 : 10} onClick={() => onSelectVenue(v.placeId)}>
            <div style={{ position: 'relative' }}>
              <div className={`m-pin ${isSel ? 'sel' : ''}`}><span>{i + 1}</span></div>
              {(isSel || v.placeId === focusId) && <div className="m-label">{v.name}</div>}
            </div>
          </AdvancedMarker>
        );
      })}
      {selected && !top.includes(selected) && (
        <AdvancedMarker position={selected.location} title={selected.name} zIndex={30}>
          <div style={{ position: 'relative' }}>
            <div className="m-pin sel"><span>★</span></div>
            <div className="m-label">{selected.name}</div>
          </div>
        </AdvancedMarker>
      )}
      {home && (
        <AdvancedMarker position={home} title="Your home (only you see this)" zIndex={20}>
          <div className="m-home" style={{ background: myColor }}>⌂</div>
        </AdvancedMarker>
      )}
      {trip?.pickups?.map((p) => (
        <AdvancedMarker key={p.name + p.at} position={p.location} title={`Pick up ${p.name}`} zIndex={25}>
          <div className="m-pick" style={{ background: people.find((x) => x.name === p.name)?.color ?? '#2f8a5b' }}>
            {p.name[0]}
          </div>
        </AdvancedMarker>
      ))}
    </>
  );
}
