import {describe,expect,it} from 'vitest'
import {createDemoTournament} from '../../demo/demoSeed'
import {jollyTargets,lupinTargets} from './gameEffectPresentation'

describe('meta card effect resolution',()=>{
  it('defaults Jolly to every normal enabled card and excludes recursive meta cards',()=>{
    const tournament=createDemoTournament();const base=tournament.cards[0]
    const definitions=[base,{...base,id:'jolly',name:'Jolly',slug:'jolly'},{...base,id:'lupin',name:'Lupin',slug:'lupin'},{...base,id:'off',enabled:false}]
    expect(jollyTargets(definitions).map(card=>card.id)).toEqual([base.id])
    expect(jollyTargets(definitions,[base.id]).map(card=>card.id)).toEqual([base.id])
  })
  it('offers Lupin only active stealable opponent cards',()=>{
    const tournament=createDemoTournament();const match=tournament.matches[0];const source={...tournament.teamCards[0],id:'lupin-use',matchId:match.id,teamId:match.teamAId}
    tournament.cards[0].canBeStolen=true
    tournament.teamCards=[source,{...tournament.teamCards[0],id:'victim',matchId:match.id,teamId:match.teamBId,state:'active',cardId:tournament.cards[0].id},{...tournament.teamCards[0],id:'own',matchId:match.id,teamId:match.teamAId,state:'active'}]
    expect(lupinTargets(tournament,source).map(card=>card.id)).toEqual(['victim'])
  })
})
