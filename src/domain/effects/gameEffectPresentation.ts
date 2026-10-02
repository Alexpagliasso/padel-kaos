import type { CardDefinition, TeamCard, Tournament } from '../../shared/types/domain'
import type { DiceFace } from '../live/diceShow'

export type GameEffectPresentation = { id:string;title:string;shortDescription:string;longDescription:string;artwork?:string;durationType?:CardDefinition['durationType'];durationValue?:number }
export const diceEffectPresentation=(face:DiceFace):GameEffectPresentation=>({id:face.productCode,title:face.title,shortDescription:face.shortDescription,longDescription:face.shortDescription,artwork:face.artwork})
export const cardEffectPresentation=(card:CardDefinition):GameEffectPresentation=>({id:card.id,title:card.name,shortDescription:card.description,longDescription:card.longDescription??card.description,artwork:card.imageUrl??undefined,durationType:card.durationType,durationValue:card.durationValue})

export const isJolly=(card?:CardDefinition)=>Boolean(card&&(card.slug==='jolly'||card.name.trim().toLowerCase()==='jolly'))
export const isLupin=(card?:CardDefinition)=>Boolean(card&&(card.slug==='lupin'||card.name.trim().toLowerCase()==='lupin'))
export function jollyTargets(definitions:CardDefinition[],allowedIds?:string[]){const allowed=allowedIds?new Set(allowedIds):undefined;return definitions.filter(card=>card.enabled&&!isJolly(card)&&!isLupin(card)&&(!allowed||allowed.has(card.id)))}
export function lupinTargets(tournament:Tournament,source:TeamCard){return tournament.teamCards.filter(card=>card.matchId===source.matchId&&card.teamId!==source.teamId&&card.state==='active'&&tournament.cards.find(def=>def.id===card.cardId)?.canBeStolen)}
