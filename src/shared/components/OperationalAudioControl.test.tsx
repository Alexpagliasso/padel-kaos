// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {createDemoTournament} from '../../demo/demoSeed'
import {OperationalAudioControl} from './OperationalAudioControl'
import {operationalAudioPreferenceKey} from '../hooks/useOperationalAudioAlerts'

class MockAudioContext{
  static state:'suspended'|'running'='suspended';state=MockAudioContext.state;currentTime=0;destination={};resume=vi.fn(async()=>{this.state=MockAudioContext.state});createOscillator=()=>({frequency:{value:0},connect:vi.fn(),start:vi.fn(),stop:vi.fn()});createGain=()=>({gain:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn()})
}

describe('Regia operational audio control',()=>{
  beforeEach(()=>{localStorage.clear();MockAudioContext.state='running';Object.defineProperty(window,'AudioContext',{configurable:true,value:MockAudioContext})})
  afterEach(cleanup)
  it('enables and disables audio through a user gesture',async()=>{render(<OperationalAudioControl tournament={createDemoTournament()}/>);fireEvent.click(screen.getByRole('button',{name:'Attiva audio'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Audio attivo, disattiva'})).toBeTruthy());expect(localStorage.getItem(operationalAudioPreferenceKey)).toBe('true');fireEvent.click(screen.getByRole('button',{name:'Audio attivo, disattiva'}));expect(screen.getByRole('button',{name:'Attiva audio'})).toBeTruthy();expect(localStorage.getItem(operationalAudioPreferenceKey)).toBe('false')})
  it('does not claim audio is enabled while AudioContext remains suspended',async()=>{MockAudioContext.state='suspended';render(<OperationalAudioControl tournament={createDemoTournament()}/>);fireEvent.click(screen.getByRole('button',{name:'Attiva audio'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Attiva audio'})).toBeTruthy());expect(localStorage.getItem(operationalAudioPreferenceKey)).not.toBe('true')})
})
