import {useCallback,useEffect,useRef,useState} from 'react'
import type {Tournament} from '../types/domain'
import {getOperationalTimers,OperationalExpiryTracker,type OperationalAlert,type OperationalAlertKind} from '../../domain/live/operationalAudioAlerts'
import {useSharedClock} from './useSharedClock'

export const operationalAudioPreferenceKey='padel-kaos:regia-audio-enabled'
type BrowserAudioContext=AudioContext

function preferred(){try{return window.localStorage.getItem(operationalAudioPreferenceKey)==='true'}catch{return false}}
function createContext(){const Constructor=window.AudioContext||(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!Constructor)throw new Error('Audio non supportato da questo browser.');return new Constructor()}
function tone(context:BrowserAudioContext,at:number,duration:number,frequency:number){const oscillator=context.createOscillator();const gain=context.createGain();oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.12,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(at);oscillator.stop(at+duration+.02)}
export function playOperationalPattern(context:BrowserAudioContext,kind:OperationalAlertKind){const start=context.currentTime+.02;const pattern=kind==='set'?[[0,.14,880],[.22,.14,880],[.44,.22,1040]]:kind==='dice'?[[0,.32,620],[.44,.32,760]]:[[0,.1,760],[.16,.1,900]];for(const [offset,duration,frequency] of pattern)tone(context,start+offset,duration,frequency)}

export function useOperationalAudioAlerts(tournament:Tournament){
  const now=useSharedClock();const tracker=useRef(new OperationalExpiryTracker());const context=useRef<BrowserAudioContext|undefined>(undefined);const [wanted,setWanted]=useState(preferred);const [ready,setReady]=useState(false);const [lastAlert,setLastAlert]=useState<OperationalAlert>()
  const disable=useCallback(()=>{setWanted(false);setReady(false);try{window.localStorage.setItem(operationalAudioPreferenceKey,'false')}catch{/* preference is optional */}},[])
  const enable=useCallback(async()=>{try{const audio=context.current??createContext();context.current=audio;if(audio.state==='suspended')await audio.resume();const unlocked=audio.state==='running';setWanted(unlocked);setReady(unlocked);window.localStorage.setItem(operationalAudioPreferenceKey,String(unlocked));return unlocked}catch{setWanted(false);setReady(false);return false}},[])
  useEffect(()=>{const alerts=tracker.current.update(getOperationalTimers(tournament),now);if(!wanted||!ready||context.current?.state!=='running')return;for(const alert of alerts){playOperationalPattern(context.current,alert.kind);setLastAlert(alert)}},[now,ready,tournament,wanted])
  return{enabled:wanted&&ready,requiresGesture:wanted&&!ready,lastAlert,enable,disable,toggle:wanted&&ready?disable:enable}
}
