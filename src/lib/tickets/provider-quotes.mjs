import {MIRROR_MARKETS} from "./eventspy-mirror-schema.mjs";
export const MARKETPLACE_IDS=MIRROR_MARKETS;

export function currentProviderQuotes(history) {
  const quotes=MIRROR_MARKETS.map((provider,canonicalIndex)=>{
    const field=`${provider}Cents`;
    for(let index=history.length-1;index>=0;index--){
      const priceCents=history[index]?.[field];
      if(Number.isSafeInteger(priceCents)&&priceCents>0)return{provider,priceCents,observedAt:history[index].observedAt,canonicalIndex};
    }
    return{provider,priceCents:null,observedAt:null,canonicalIndex};
  });
  quotes.sort((left,right)=>{
    if(left.priceCents===null)return right.priceCents===null?left.canonicalIndex-right.canonicalIndex:1;
    if(right.priceCents===null)return-1;
    return left.priceCents-right.priceCents||left.canonicalIndex-right.canonicalIndex;
  });
  const lowest=quotes.find(quote=>quote.priceCents!==null)?.priceCents??null;
  const lowestCount=quotes.filter(quote=>quote.priceCents===lowest&&lowest!==null).length;
  return quotes.map((quote,index)=>({...quote,rank:index+1,isLowest:quote.priceCents===lowest&&lowest!==null,isTiedLowest:quote.priceCents===lowest&&lowestCount>1}));
}
