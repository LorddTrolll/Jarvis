import { useRef, useState } from 'react'
import { ArrowUpRight, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, LocateFixed, MapPin, Moon, RefreshCw, Search, Sun, X } from 'lucide-react'
import { api } from '../api'
import { Modal } from '../components/UI'
import type { Environment, Place } from './useEnvironment'

export function WeatherIcon({ code, day }: { code: number; day: boolean }) {
  const Icon = code >= 95 ? CloudLightning : code >= 71 && code <= 77 || code >= 85 && code <= 86 ? CloudSnow : code >= 51 ? CloudRain : code >= 45 ? CloudFog : code > 0 ? Cloud : day ? Sun : Moon
  return <Icon size={30} strokeWidth={1.4} />
}

export function EnvironmentCard({ environment: e, onLocation }: { environment: Environment; onLocation: () => void }) {
  const time = e.now.toLocaleTimeString('pt-BR', { timeZone: e.timezone, hour: '2-digit', minute: '2-digit' })
  const date = e.now.toLocaleDateString('pt-BR', { timeZone: e.timezone, weekday: 'long', day: 'numeric', month: 'long' })
  return <section className="environment-card" aria-label="Data, hora, local e clima">
    <div className="clock-block"><span className="card-kicker">NO SEU TEMPO</span><time className="local-time" dateTime={e.now.toISOString()}>{time}<span>{e.now.toLocaleTimeString('pt-BR', { timeZone: e.timezone, second: '2-digit' }).padStart(2,'0')}</span></time><p>{date}</p><small>{e.timezone.replaceAll('_', ' ')}</small></div>
    <div className="weather-block"><button className="location-button" onClick={onLocation} aria-label="Configurar localização"><MapPin size={14} /><span>{e.place?.name || 'Escolha sua cidade'}</span><ArrowUpRight size={13} /></button>
      {e.weather ? <><div className="weather-reading"><WeatherIcon code={e.weather.code} day={e.weather.is_day} /><strong>{Math.round(e.weather.temperature)}<span>°C</span></strong><div><p>{e.weather.description}</p><small>Máx. {Math.round(e.weather.high)}° · Mín. {Math.round(e.weather.low)}°</small></div></div><div className="weather-details"><span>Sensação {Math.round(e.weather.feels_like)}° · Umidade {e.weather.humidity}%</span><button aria-label="Atualizar clima" disabled={e.loading} onClick={e.refresh}><RefreshCw size={12} className={e.loading ? 'spin' : ''} /></button></div><small className="weather-source"><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · Dados de {e.weather.observed_at.split('T')[1]?.slice(0,5)}{e.error && ' · atualização indisponível'}</small></> : <div className="weather-empty"><Cloud size={27} /><p>{e.loading ? 'Consultando o clima…' : e.error || 'O clima aparece ao escolher uma localização.'}</p>{e.error && <button className="text-button" onClick={e.refresh}>Tentar novamente</button>}</div>}
    </div>
  </section>
}

export function LocationDialog({ environment: e, onClose }: { environment: Environment; onClose: () => void }) {
  const [query, setQuery] = useState(''), [results, setResults] = useState<Place[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [searched, setSearched] = useState(false)
  const request = useRef(0)
  return <Modal title="Sua localização" onClose={onClose}><p className="muted">Escolha uma cidade para ver o horário e o clima dela. A cidade escolhida fica salva apenas neste navegador.</p>
    <form className="location-search" onSubmit={event => {
      event.preventDefault(); const id = ++request.current; setBusy(true); setError(''); setSearched(false)
      void api<Place[]>(`/environment/cities?name=${encodeURIComponent(query.trim())}`).then(value => { if (id === request.current) { setResults(value); setSearched(true) } }).catch(ex => { if (id === request.current) setError(ex.message) }).finally(() => { if (id === request.current) setBusy(false) })
    }}><label>Buscar cidade<input placeholder="Ex.: Recife" value={query} minLength={2} maxLength={100} required onChange={event => { setQuery(event.target.value); request.current++; setBusy(false); setResults([]); setSearched(false) }} /></label><button className="button primary" disabled={busy || query.trim().length < 2}><Search size={16} />{busy ? 'Buscando…' : 'Buscar'}</button></form>
    {error && <p role="alert" className="location-error">{error}</p>}<div className="city-results">{results.map(p => <button key={`${p.latitude},${p.longitude}`} onClick={() => { e.select(p); onClose() }}><MapPin size={16} /><span>{p.name}</span><ArrowUpRight size={13} /></button>)}{searched && !results.length && <p>Nenhuma cidade encontrada. Tente o nome completo.</p>}</div>
    <div className="location-consent"><strong>Usar a posição do dispositivo</strong><p>Após sua permissão, uma posição aproximada é enviada ao Open-Meteo e ao OpenStreetMap para consultar cidade e clima. Ela não é salva no banco do Jarvis nem neste navegador.</p><button className="button secondary" disabled={e.gps} onClick={e.locate}><LocateFixed size={16} />{e.gps ? 'Localizando…' : 'Usar minha localização'}</button>{e.error && <p role="alert">{e.error}</p>}{e.place && <p className="selected-place">Selecionado: {e.place.name}</p>}</div>
    <div className="location-footer"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a><button className="text-button" onClick={() => { e.select(null); onClose() }}><X size={13} />Remover localização</button></div>
  </Modal>
}
