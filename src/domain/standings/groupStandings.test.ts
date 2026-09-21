import { describe,expect,it } from 'vitest'
import { calculateTournamentStandings } from './groupStandings'
import type { Tournament } from '../../shared/types/domain'

describe('confirmed standings',()=>it('counts only confirmed completed matches',()=>{
  const team=(id:string)=>({id,name:id,shortName:id,color:'#fff',groupId:'g',ranking:null,players:[]})
  const base={id:'t',name:'T',groups:[{id:'g',name:'G'}],courts:[],teams:[team('a'),team('b')],rounds:[],matches:[],cards:[],teamCards:[],diceRules:[],kaosEvents:[],matchEvents:[],globalEvents:[],standings:[]} satisfies Tournament
  const score={points:{A:'0' as const,B:'0' as const},games:{A:0,B:0},sets:{A:2,B:0},currentSet:2}
  const match={id:'m',courtId:'c',groupId:'g',teamAId:'a',teamBId:'b',status:'completed' as const,score,lineups:[],activeCardUsageIds:[],resultConfirmedAt:'now'}
  const events=[1,2].map((set,index)=>({id:String(set),matchId:'m',type:'SET_WON' as const,payload:{set_number:set,games_a:6,games_b:index},actorUserId:'r',createdAt:'now'}))
  expect(calculateTournamentStandings({...base,matches:[match],matchEvents:events}).find(row=>row.teamId==='a')).toMatchObject({played:1,won:1,lost:0})
  expect(calculateTournamentStandings({...base,matches:[{...match,resultConfirmedAt:undefined}],matchEvents:events}).every(row=>row.played===0)).toBe(true)
}))
