import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DiceRule } from '../shared/types/domain'
import { cardImageExtension, validateCardImage } from '../domain/cards/cardImage'
import { requireSupabase } from '../services/supabase/client'
import { supabaseTournamentKeys } from './supabase/queryKeys'

export type DiceEffectDraft = { title:string;description:string;longDescription:string;imageUrl:string|null;enabled:boolean }
type DiceRow = { id:string;dice_value:number;title:string;description:string;long_description:string|null;image_url:string|null;effect_type:string;duration_seconds:number;product_code:string|null;enabled:boolean }
export const mapDiceEffectRow=(row:DiceRow):DiceRule=>({id:row.id,value:Math.min(6,Math.max(1,row.dice_value)) as DiceRule['value'],title:row.title,description:row.description,longDescription:row.long_description??row.description,imageUrl:row.image_url,effectType:row.effect_type,durationSeconds:row.duration_seconds,productCode:row.product_code??undefined,enabled:row.enabled})
export const diceImagePath=(tournamentId:string,ruleId:string,uniqueId:string,mime:string)=>`${tournamentId}/${ruleId}/${uniqueId}.${cardImageExtension(mime)}`

export function useDiceEffectRepository(tournamentId:string){
  const client=()=>requireSupabase();const queryClient=useQueryClient();const refresh=()=>queryClient.invalidateQueries({queryKey:supabaseTournamentKeys.detail(tournamentId)})
  const create=useMutation({mutationFn:async(draft:DiceEffectDraft)=>{const{data,error}=await client().rpc('create_dice_effect',{p_tournament_id:tournamentId,p_title:draft.title,p_description:draft.description,p_long_description:draft.longDescription,p_enabled:draft.enabled});if(error)throw error;return mapDiceEffectRow(data as unknown as DiceRow)},onSuccess:refresh})
  const update=useMutation({mutationFn:async({id,draft}:{id:string;draft:DiceEffectDraft})=>{const{data,error}=await client().rpc('update_dice_effect',{p_dice_rule_id:id,p_title:draft.title,p_description:draft.description,p_long_description:draft.longDescription,p_image_url:draft.imageUrl,p_enabled:draft.enabled});if(error)throw error;return mapDiceEffectRow(data as unknown as DiceRow)},onSuccess:refresh})
  const upload=async(ruleId:string,file:File)=>{const validation=validateCardImage(file);if(validation)throw new Error(validation);const path=diceImagePath(tournamentId,ruleId,crypto.randomUUID(),file.type);const bucket=client().storage.from('dice-effect-images');const{error}=await bucket.upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;return bucket.getPublicUrl(path).data.publicUrl}
  const remove=async(ruleId:string,url:string)=>{try{const marker='/storage/v1/object/public/dice-effect-images/';const path=decodeURIComponent(new URL(url).pathname.split(marker)[1]??'');if(!path.startsWith(`${tournamentId}/${ruleId}/`))return;const{error}=await client().storage.from('dice-effect-images').remove([path]);if(error)throw error}catch(cause){if(cause instanceof TypeError)return;throw cause}}
  return{create:create.mutateAsync,update:(id:string,draft:DiceEffectDraft)=>update.mutateAsync({id,draft}),upload,remove,isPending:create.isPending||update.isPending}
}
