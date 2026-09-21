// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Tournament } from '../types/domain'
import { CardPlayNotification } from './LiveEffects'

const base: Tournament = {
  id:'t1',name:'Torneo',groups:[],courts:[{id:'court1',name:'Campo 1'}],rounds:[],
  teams:[{id:'a',name:'Team Blu',shortName:'BLU',color:'#00f',groupId:'',ranking:null,players:[]},{id:'b',name:'Team Rossa',shortName:'ROS',color:'#f00',groupId:'',ranking:null,players:[]}],
  matches:[{id:'m1',courtId:'court1',groupId:'',teamAId:'a',teamBId:'b',status:'live_set_1',score:{currentSet:1,points:{A:'0',B:'0'},games:{A:0,B:0},sets:{A:0,B:0}},lineups:[],activeCardUsageIds:[]}],
  cards:[{id:'cd1',name:'Il Prescelto',slug:'il-prescelto',description:'Carta',longDescription:'Carta',category:'bonus',target:'own_team',activationTiming:'anytime',durationType:'games',durationValue:1,effectType:'chosen',enabled:true,isGlobal:false}],
  teamCards:[],diceRules:[],kaosEvents:[],matchEvents:[],globalEvents:[],standings:[],
}

describe('CardPlayNotification',()=>{
  beforeEach(()=>sessionStorage.clear())

  it('does not replay an event already present on mount',()=>{
    const tournament=withPlayedEvent(base,'event-old','pending')
    render(<CardPlayNotification tournament={tournament}/>)
    expect(screen.queryByText('CARTA GIOCATA')).toBeNull()
  })

  it('shows a newly observed pending event once and clears it after rejection',async()=>{
    const view=render(<CardPlayNotification tournament={base}/>)
    view.rerender(<CardPlayNotification tournament={withPlayedEvent(base,'event-new','pending')}/>)
    expect(await screen.findByText('CARTA GIOCATA')).toBeTruthy()
    expect(screen.getByText('IN ATTESA DELL’ARBITRO')).toBeTruthy()
    view.rerender(<CardPlayNotification tournament={withPlayedEvent(base,'event-new','cancelled')}/>)
    await waitFor(()=>expect(screen.queryByText('CARTA GIOCATA')).toBeNull())
  })

  it('clears an auto-activated notification when its match is completed',async()=>{
    const view=render(<CardPlayNotification tournament={base}/>)
    const active=withPlayedEvent(base,'event-active','active',false)
    view.rerender(<CardPlayNotification tournament={active}/>)
    expect(await screen.findByText('CARTA GIOCATA')).toBeTruthy()
    view.rerender(<CardPlayNotification tournament={{...active,matches:[{...active.matches[0],status:'completed',resultConfirmedAt:'2026-09-19T10:00:00Z'}],teamCards:[{...active.teamCards[0],state:'expired'}]}}/>)
    await waitFor(()=>expect(screen.queryByText('CARTA GIOCATA')).toBeNull())
  })
})

function withPlayedEvent(tournament:Tournament,eventId:string,state:'pending'|'active'|'cancelled',requiresValidation=true):Tournament {
  return {...tournament,
    teamCards:[{id:'mc1',teamId:'a',cardId:'cd1',matchId:'m1',state}],
    matchEvents:[{id:eventId,matchId:'m1',type:'CARD_PLAYED',actorUserId:'u1',createdAt:new Date().toISOString(),payload:{match_card_id:'mc1',card_definition_id:'cd1',team_id:'a',requires_referee_validation:requiresValidation}}],
  }
}
