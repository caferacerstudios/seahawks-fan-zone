import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isCurrentRosterPlayer } from "./roster.mjs";

export const PROMPT_VERSION = "professional-player-profile-v3-tiered";
export const DEFAULT_MODEL = "gpt-5.4-mini";
export const PROFILE_TIERS = ["featured", "core", "contributor", "developmental"];
export const TIER_MAX_OUTPUT_TOKENS = { featured:2200, core:1700, contributor:1250, developmental:900 };
export const DEFAULT_MAX_OUTPUT_TOKENS = TIER_MAX_OUTPUT_TOKENS.contributor;
export const DEFAULT_RATES = { "gpt-5.4-mini": { input: 0.75, output: 4.5 } };

export function resolveProfileTier(playerId, tierStore = {}, hasMeaningfulStats = false, warn = console.warn) {
  const configured = tierStore?.players?.[String(playerId)]?.tier;
  if (configured == null) return hasMeaningfulStats ? "contributor" : "developmental";
  if (PROFILE_TIERS.includes(configured)) return configured;
  warn(`Unknown profile tier for ${playerId}: ${configured}; using contributor.`);
  return "contributor";
}

function factsForPlayer(playerId, careerStore = {}, editorialStore = {}) {
  const career = careerStore?.players?.[playerId] || null;
  const editorialFacts = (editorialStore?.facts || []).filter((fact) => fact?.canonicalPlayerId === playerId);
  return { career, editorialFacts };
}

export function normalizePlayerName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘`]/g, "'").replace(/\./g, "").replace(/[-']/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
const fullName = (p) => String(p?.full_name || p?.name || `${p?.first_name || ""} ${p?.last_name || ""}`).trim();
const providerId = (v) => { const id = v?.providerPlayerId ?? v?.provider_player_id ?? v?.player_id ?? v?.player?.id ?? v?.id; return id == null || id === "" ? null : String(id); };
const pos = (v) => String(v?.position_abbreviation || v?.position || v?.player?.position_abbreviation || v?.player?.position || "").toUpperCase();
const number = (v) => v?.jersey_number ?? v?.jersey ?? v?.number ?? v?.player?.jersey_number ?? null;
function compatible(roster, candidate) {
  const a = pos(roster), b = pos(candidate); if (a && b && !a.split("/").includes(b) && !b.split("/").includes(a)) return false;
  const x = number(roster), y = number(candidate); return x == null || y == null || String(x) === String(y);
}
function unique(candidates, roster, source, log) {
  const valid = candidates.filter((candidate) => compatible(roster, candidate));
  if (valid.length === 1) return valid[0];
  if (candidates.length > 1) log(`Ambiguous ${source} match for ${roster.name} (${roster.id}); provider facts were not attached.`);
  return null;
}
export function matchRosterPlayer(roster, directory = [], statRows = [], log = console.warn) {
  if (roster.providerPlayerId != null) {
    const id = String(roster.providerPlayerId);
    const candidates = [...directory, ...statRows.map((row) => row?.player).filter(Boolean)].filter((p) => providerId(p) === id);
    const deduped = [...new Map(candidates.map((p) => [providerId(p), p])).values()];
    const hit = unique(deduped, roster, "provider ID", log);
    if (hit) return { provider: hit, providerPlayerId: id, source: "providerPlayerId" };
  }
  const wanted = normalizePlayerName(roster.name), matches = directory.filter((p) => normalizePlayerName(fullName(p)) === wanted), hit = unique(matches, roster, "player-directory name", log);
  if (hit) return { provider: hit, providerPlayerId: providerId(hit), source: "playerDirectoryName" };
  if (matches.length > 1) return null;
  const embedded = [...new Map(statRows.map((r) => r?.player).filter((p) => p && normalizePlayerName(fullName(p)) === wanted).map((p) => [providerId(p) || JSON.stringify(p), p])).values()];
  const statHit = unique(embedded, roster, "stat-record name", log);
  return statHit ? { provider: statHit, providerPlayerId: providerId(statHit), source: "statRecordName" } : null;
}

const FIELDS = {
  QB:["games_played","passing_attempts","attempts","completions","passing_yards","passing_touchdowns","interceptions","rushing_attempts","rushing_yards","rushing_touchdowns","fumbles"],
  RB:["games_played","rushing_attempts","carries","rushing_yards","targets","receptions","receiving_yards","rushing_touchdowns","receiving_touchdowns","fumbles"],
  FB:["games_played","rushing_attempts","carries","rushing_yards","targets","receptions","receiving_yards","rushing_touchdowns","receiving_touchdowns","fumbles"],
  WR:["games_played","targets","receptions","receiving_yards","receiving_touchdowns","rushing_attempts","rushing_yards","rushing_touchdowns","fumbles"],
  TE:["games_played","targets","receptions","receiving_yards","receiving_touchdowns","fumbles"],
  K:["games_played","field_goals_attempted","field_goals_made","extra_points_attempted","extra_points_made"],
  P:["games_played","punts","punting_yards","punt_average","punting_average","punts_inside_20"],
  DEF:["games_played","total_tackles","tackles","sacks","defensive_interceptions","passes_defended","passes_defensed","forced_fumbles","fumble_recoveries"],
};
export function selectRelevantStats(position, row) {
  const keys = FIELDS[position] || (["CB","S","LB","DE","DT","NT"].includes(position) ? FIELDS.DEF : []), out = {};
  for (const key of keys) if (typeof row?.[key] === "number" && Number.isFinite(row[key]) && row[key] !== 0) out[key] = row[key];
  return out;
}
function bestRow(rows, id) { return id ? rows.filter((r) => providerId(r) === id).sort((a,b) => Object.values(b).filter(Number.isFinite).reduce((x,y)=>x+Math.abs(y),0)-Object.values(a).filter(Number.isFinite).reduce((x,y)=>x+Math.abs(y),0))[0] || null : null; }
export function enrichRoster(rosterStore, nflData, directory = [], log = console.warn, tierStore = {}, careerStore = {}, editorialStore = {}) {
  const rows = Array.isArray(nflData?.playerSeasonStats) ? nflData.playerSeasonStats : [];
  return (rosterStore?.players || []).filter(isCurrentRosterPlayer).map((roster) => {
    const match = matchRosterPlayer(roster, directory, rows, log), provider = match?.provider, stats = selectRelevantStats(roster.position, bestRow(rows, match?.providerPlayerId));
    const canonicalRosterId=String(roster.id), extra=factsForPlayer(canonicalRosterId,careerStore,editorialStore);
    const career = extra.career && (!extra.career.providerPlayerId || !match?.providerPlayerId || String(extra.career.providerPlayerId)===String(match.providerPlayerId)) ? extra.career : null;
    const meaningful=Object.keys(stats).length>0 || (career?.recentSeasons||[]).some((season)=>Object.values(season).some((value)=>typeof value==="number"&&value>0));
    const playerStatsSeason=nflData?.playerStatsSeason ?? nflData?.season ?? null;
    return { canonicalRosterId, providerPlayerId:match?.providerPlayerId || career?.providerPlayerId || null, fullName:roster.name, position:roster.position || pos(provider) || null, jerseyNumber:roster.number ?? number(provider), height:roster.height ?? provider?.height ?? null, weight:roster.weight ?? provider?.weight ?? null, college:roster.college ?? provider?.college ?? null, experience:roster.experience ?? roster.years_pro ?? provider?.experience ?? provider?.years_pro ?? null, rosterStatus:roster.status, profileTier:resolveProfileTier(canonicalRosterId,tierStore,meaningful,log), playerStatsSeason, statisticsScope:Object.keys(stats).length ? "regular" : null, statistics:stats, careerFacts:career, editorialFacts:extra.editorialFacts };
  });
}
function canonical(v) { if (Array.isArray(v)) return v.map(canonical); if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).filter((k)=>!["reviewedAt","updatedAt","accessedAt","generatedAt"].includes(k)).sort().map((k)=>[k,canonical(v[k])])); return v; }
export function semanticInputHash(player, model, promptVersion = PROMPT_VERSION) { return crypto.createHash("sha256").update(JSON.stringify(canonical({facts:buildModelInput(player),tier:player.profileTier,model,promptVersion}))).digest("hex"); }

export const SYSTEM_PROMPT = "You are writing an original player profile for an independent Seattle football publication. Write polished, professional sports-reference copy in neutral third person. Use only facts supplied in the input JSON. Do not rely on outside knowledge. Do not invent awards, transactions, roles, statistics, injuries, contracts, or career history. If the supplied facts are sparse, write less rather than filling space.";
const nullableString={anyOf:[{type:"string"},{type:"null"}]};
export const PROFILE_SCHEMA = {type:"object",additionalProperties:false,properties:{profileTier:{type:"string",enum:PROFILE_TIERS},dek:nullableString,biography:{type:"object",additionalProperties:false,properties:{overview:nullableString,careerContext:nullableString,seahawksContext:nullableString},required:["overview","careerContext","seahawksContext"]},careerHighlights:{type:"array",maxItems:6,items:{type:"string"}},seasonOverview:{anyOf:[{type:"null"},{type:"object",additionalProperties:false,properties:{paragraph:{type:"string"},bullets:{type:"array",maxItems:3,items:{type:"string"}}},required:["paragraph","bullets"]}] }},required:["profileTier","dek","biography","careerHighlights","seasonOverview"]};
const DEPTH={featured:{dek:"20-35 words",overview:"80-130 words",careerContext:"80-140 words",seahawksContext:"70-120 words",highlights:"4-6 bullets",seasonOverview:"75-120 words",total:"roughly 350-500 words when facts support it"},core:{total:"roughly 220-350 words"},contributor:{total:"roughly 120-220 words"},developmental:{total:"roughly 60-140 words"}};
const camelKey=(key)=>String(key).replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase());
const cleanValue=(value)=>{if(Array.isArray(value)){const seen=new Set();return value.map(cleanValue).filter((item)=>{const key=JSON.stringify(canonical(item));if(seen.has(key))return false;seen.add(key);return true;});}if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([key,item])=>!["id","canonicalPlayerId","providerPlayerId","source","sourceFacts","reviewedAt","updatedAt","accessedAt","generatedAt"].includes(key)&&item!==undefined).map(([key,item])=>[key,cleanValue(item)]));return value;};
const editorialValues=(player,type)=>cleanValue((player.editorialFacts||[]).filter((fact)=>fact?.type===type).map((fact)=>fact.value));
export function buildModelInput(player) {
  const career=player.careerFacts||{},seasonYear=player.playerStatsSeason??null,recent=(career.recentSeasons||[]),matching=recent.find((item)=>item?.season===seasonYear&&!item?.postseason),statistics={};
  for(const [key,value] of Object.entries(matching||{})) if(!["season","team","postseason"].includes(key)) statistics[camelKey(key)]=value;
  for(const [key,value] of Object.entries(player.statistics||{})) statistics[camelKey(key)]=value;
  const first=(type)=>editorialValues(player,type)[0]??null;
  return cleanValue({
    player:{name:player.fullName,position:player.position,profileTier:player.profileTier,currentRole:first("currentRole")?.role??null},
    career:{draft:first("draftSelection"),teamTimeline:career.careerTimeline?.length?career.careerTimeline:first("teamHistory")?.teams??[],careerTotals:career.careerTotals||{},recentSeasons:recent.filter((item)=>item?.season!==seasonYear||item?.postseason),careerHighs:career.careerHighs||{},honors:editorialValues(player,"honor"),championships:editorialValues(player,"championship"),collegeAchievements:editorialValues(player,"collegeAchievement")},
    seattle:{acquisition:first("acquisition"),teamAchievements:editorialValues(player,"teamAchievement"),postseasonHighlights:editorialValues(player,"postseasonPerformance")},
    season:Object.keys(statistics).length?{season:seasonYear,statistics}:null,
  });
}
export function buildProfilePrompt(player, repairFeedback = null) { const tier=PROFILE_TIERS.includes(player.profileTier)?player.profileTier:"contributor";return [{role:"system",content:SYSTEM_PROMPT},{role:"user",content:JSON.stringify({facts:buildModelInput(player),requirements:{profileTier:tier,depth:DEPTH[tier],style:["professional","readable","sports-journalism tone","third person","no we, our, or us","no hype","no predictions","no AI, data, or prompt language","do not mechanically repeat the player header","do not simply rewrite the statistics table"],seasonOverview:Object.keys(buildModelInput(player).season?.statistics||{}).length?"Write from the season facts.":"Return null."},repair:repairFeedback})}]; }
export function requestBody(model, player, max = null, repair = null) { const limit=max??TIER_MAX_OUTPUT_TOKENS[player.profileTier]??TIER_MAX_OUTPUT_TOKENS.contributor; return {model,reasoning:{effort:"low"},input:buildProfilePrompt(player,repair),text:{verbosity:"low",format:{type:"json_schema",name:"player_profile",strict:true,schema:PROFILE_SCHEMA}},max_output_tokens:limit}; }
const wordCount = (v) => String(v||"").trim().split(/\s+/).filter(Boolean).length;
export function validateGeneratedProfile(output, player) {
  const errors=[],biography=output?.biography,sections=[output?.dek,biography?.overview,biography?.careerContext,biography?.seahawksContext,output?.seasonOverview?.paragraph],bullets=[...(Array.isArray(output?.careerHighlights)?output.careerHighlights:[]),...(Array.isArray(output?.seasonOverview?.bullets)?output.seasonOverview.bullets:[])],copy=[...sections,...bullets].filter((value)=>typeof value==="string").join(" ");
  const nullableText=(value)=>value===null||typeof value==="string";
  const structure=output&&typeof output==="object"&&output.profileTier===player.profileTier&&nullableText(output.dek)&&biography&&typeof biography==="object"&&["overview","careerContext","seahawksContext"].every((key)=>key in biography&&nullableText(biography[key]))&&Array.isArray(output.careerHighlights)&&output.careerHighlights.every((item)=>typeof item==="string")&&("seasonOverview" in output)&&(output.seasonOverview===null||(typeof output.seasonOverview?.paragraph==="string"&&Array.isArray(output.seasonOverview?.bullets)&&output.seasonOverview.bullets.every((item)=>typeof item==="string")));
  if(!structure) errors.push("required JSON structure is missing or profile tier changed");
  if(![biography?.overview,biography?.careerContext,biography?.seahawksContext].some((value)=>typeof value==="string"&&value.trim())) errors.push("biography is completely empty");
  const maximum={featured:600,core:425,contributor:275,developmental:180}[player.profileTier]||275;
  if(wordCount(copy)>maximum) errors.push(`profile wildly exceeds the ${maximum}-word tier maximum`);
  if(/\b(?:we|our|ours|us)\b/i.test(copy)) errors.push("first-person fan language is prohibited");
  if(/\b(?:AI|artificial intelligence|prompt(?:s|ed|ing)?|supplied data|input JSON)\b/i.test(copy)) errors.push("AI, prompt, or supplied-data language is prohibited");
  if(!buildModelInput(player).season&&output?.seasonOverview!==null) errors.push("season overview exists without season data");
  return {valid:errors.length===0,errors};
}
export function ratesFor(model, env) { const known=DEFAULT_RATES[model], input=env.PLAYER_PROFILE_INPUT_RATE_PER_MILLION_USD??known?.input, output=env.PLAYER_PROFILE_OUTPUT_RATE_PER_MILLION_USD??known?.output; if(input==null||output==null||!Number.isFinite(Number(input))||!Number.isFinite(Number(output))) throw new Error(`Unknown model pricing for ${model}; set PLAYER_PROFILE_INPUT_RATE_PER_MILLION_USD and PLAYER_PROFILE_OUTPUT_RATE_PER_MILLION_USD.`); return {input:Number(input),output:Number(output)}; }
// Charge all reported input tokens at the configured input rate. This is
// deliberately conservative because this generator does not assume a cached
// input discount unless pricing controls are expanded to configure one.
export function estimateCost(u,r) { return ((u.inputTokens*r.input)+(u.outputTokens*r.output))/1e6; }
const atomicWrite=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;fs.writeFileSync(tmp,`${JSON.stringify(data,null,2)}\n`);fs.renameSync(tmp,file);};
const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch{return fallback;}};
const responseText=(j)=>j?.output_text||j?.output?.flatMap((x)=>x?.content||[]).find((x)=>x?.type==="output_text")?.text;
async function callOpenAI(fetchImpl,key,body,sleep,warn) {
  for(let attempt=1;attempt<=3;attempt++){try{const res=await fetchImpl("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body)});if(res.ok){const envelope=await res.json(),d=envelope.usage?.input_tokens_details||{},o=envelope.usage?.output_tokens_details||{},usage={inputTokens:Number(envelope.usage?.input_tokens||0),cachedInputTokens:Number(d.cached_tokens||0),outputTokens:Number(envelope.usage?.output_tokens||0),reasoningTokens:Number(o.reasoning_tokens||0)};const incompleteReason=envelope.incomplete_details?.reason;if(envelope.status==="incomplete"||incompleteReason){const e=new Error(`incomplete response${incompleteReason?`: ${incompleteReason}`:""}`);e.retryableOutput=true;e.outputFailure=incompleteReason==="max_output_tokens"?"max_output_tokens":"incomplete";e.usage=usage;throw e;}if(envelope.status&&envelope.status!=="completed"){const e=new Error(`non-completed response: ${envelope.status}`);e.retryableOutput=true;e.outputFailure="incomplete";e.usage=usage;throw e;}const text=responseText(envelope);if(!text){const refused=envelope?.output?.flatMap((x)=>x?.content||[]).some((x)=>x?.type==="refusal");const e=new Error(refused?"model refusal":"missing structured output");e.retryableOutput=true;e.outputFailure="missing";e.usage=usage;throw e;}try{return{output:JSON.parse(text),usage};}catch{const e=new Error("invalid structured output");e.retryableOutput=true;e.outputFailure="malformed";e.usage=usage;throw e;}}let code="";try{code=(await res.json())?.error?.code||"";}catch{}const terminal=["credit_balance_exhausted","insufficient_quota"].includes(code),retryable=[429,500,502,503,504].includes(res.status)&&!terminal;if(!retryable||attempt===3){const e=new Error(`OpenAI request failed: HTTP ${res.status}${code?` (${code})`:""}`);e.stopRun=terminal||res.status===429;throw e;}const retry=Number(res.headers?.get?.("retry-after")),delay=Number.isFinite(retry)?retry*1000:500*2**(attempt-1);warn(`OpenAI HTTP ${res.status}; retrying after ${delay}ms.`);await sleep(delay);}catch(e){if(e.retryableOutput||e.stopRun||attempt===3||!/fetch|network|socket|ECONN|ETIMEDOUT/i.test(String(e.message)))throw e;await sleep(500*2**(attempt-1));}}
}
function acquireLock(file,staleMs,now,warn){fs.mkdirSync(path.dirname(file),{recursive:true});try{const fd=fs.openSync(file,"wx");fs.writeFileSync(fd,JSON.stringify({pid:process.pid,createdAt:now.toISOString()}));fs.closeSync(fd);return true;}catch(e){if(e.code!=="EEXIST")throw e;const lock=readJson(file,{}),age=now-Date.parse(lock.createdAt||0);if(Number.isFinite(age)&&age>staleMs){warn(`Removing abandoned player-profile lock older than ${staleMs}ms.`);fs.unlinkSync(file);return acquireLock(file,staleMs,now,warn);}return false;}}

export async function runPlayerProfileGeneration({rosterStore,nflData,playerDirectory=[],tierStore={},careerStore={},editorialStore={},existingArtifact={profiles:{}},artifactPath,ledgerPath,lockPath,env=process.env,fetchImpl=globalThis.fetch,now=new Date(),warn=console.warn,sleep=(ms)=>new Promise((r)=>setTimeout(r,ms))}) {
  const model=env.PLAYER_PROFILE_MODEL||DEFAULT_MODEL,promptVersion=env.PLAYER_PROFILE_PROMPT_VERSION||PROMPT_VERSION,configuredMax=env.PLAYER_PROFILE_MAX_OUTPUT_TOKENS?Number(env.PLAYER_PROFILE_MAX_OUTPUT_TOKENS):null,monthlyBudget=Number(env.PLAYER_PROFILE_MONTHLY_BUDGET_USD||20),runBudget=Number(env.PLAYER_PROFILE_RUN_BUDGET_USD||1),maxGen=Number(env.PLAYER_PROFILE_MAX_GENERATIONS_PER_RUN||125),refresh=env.PLAYER_PROFILE_REFRESH_MODE||(env.FORCE==="1"?"all":"stale"),rates=ratesFor(model,env),summary={considered:0,current:0,generated:0,insufficient:0,preserved:0,requests:0,inputTokens:0,cachedInputTokens:0,outputTokens:0,estimatedRunCostUsd:0,monthlyCostUsd:0,remainingMonthlyBudgetUsd:monthlyBudget,lockSkipped:false};
  if(!acquireLock(lockPath,Number(env.PLAYER_PROFILE_LOCK_STALE_MS||1800000),now,warn)){summary.lockSkipped=true;warn("Another player-profile refresh is active; using the last-known-good artifact without OpenAI requests.");return summary;}
  const releaseLock=()=>{try{fs.unlinkSync(lockPath);}catch{}};
  const signalHandlers=new Map();
  for(const signal of ["SIGINT","SIGTERM"]){const handler=()=>{releaseLock();process.removeListener(signal,handler);process.kill(process.pid,signal);};signalHandlers.set(signal,handler);}
  for(const [signal,handler] of signalHandlers) process.once(signal,handler);
  try{const players=enrichRoster(rosterStore,nflData,playerDirectory,warn,tierStore,careerStore,editorialStore).filter((p)=>!env.PLAYER_PROFILE_ID||p.canonicalRosterId===env.PLAYER_PROFILE_ID);summary.considered=players.length;const profiles={...(existingArtifact.profiles||{})},ledger=readJson(ledgerPath,{schemaVersion:1,months:{}}),month=now.toISOString().slice(0,7),m=ledger.months[month]||{requests:0,inputTokens:0,cachedInputTokens:0,outputTokens:0,reasoningTokens:0,estimatedCostUsd:0,models:{}};let stop=false;
    for(const player of players){const id=player.canonicalRosterId,old=profiles[id],max=configuredMax??TIER_MAX_OUTPUT_TOKENS[player.profileTier]??DEFAULT_MAX_OUTPUT_TOKENS,hash=semanticInputHash(player,model,promptVersion),validOld=Boolean(String(old?.bio||old?.biography?.overview||"").trim()),stale=!validOld||old?.generation?.model!==model||old?.generation?.promptVersion!==promptVersion||old?.generation?.inputHash!==hash;if(refresh!=="all"&&!stale){summary.current++;continue;}if(stop){summary.preserved+=validOld?1:0;continue;}const worst=(4000*rates.input+max*rates.output)/1e6;if(summary.requests>=maxGen||summary.estimatedRunCostUsd+worst>runBudget||m.estimatedCostUsd+worst>monthlyBudget){warn("Player-profile request or spending limit reached; retaining remaining profiles.");stop=true;summary.preserved+=validOld?1:0;continue;}if(!env.OPENAI_API_KEY){warn(`No OPENAI_API_KEY; preserving ${id}.`);summary.preserved+=validOld?1:0;continue;}let accepted=null,validation=null,lastUsage=null;
      let retryLimit=max;
      for(let repair=0;repair<2;repair++){const requestWorst=(4000*rates.input+retryLimit*rates.output)/1e6;if(summary.requests>=maxGen||summary.estimatedRunCostUsd+requestWorst>runBudget||m.estimatedCostUsd+requestWorst>monthlyBudget){warn("Player-profile spending limit prevented a repair request.");stop=true;break;}try{const repairMessage=repair?"Return the same profile as valid compact JSON matching the schema exactly.":null;const result=await callOpenAI(fetchImpl,env.OPENAI_API_KEY,requestBody(model,player,retryLimit,repairMessage),sleep,warn);summary.requests++;lastUsage=result.usage;const cost=estimateCost(result.usage,rates);summary.inputTokens+=result.usage.inputTokens;summary.cachedInputTokens+=result.usage.cachedInputTokens;summary.outputTokens+=result.usage.outputTokens;summary.estimatedRunCostUsd+=cost;m.requests++;m.inputTokens+=result.usage.inputTokens;m.cachedInputTokens+=result.usage.cachedInputTokens;m.outputTokens+=result.usage.outputTokens;m.reasoningTokens+=result.usage.reasoningTokens;m.estimatedCostUsd+=cost;m.models[model]=(m.models[model]||0)+1;m.lastUpdatedAt=now.toISOString();ledger.months[month]=m;atomicWrite(ledgerPath,ledger);validation=validateGeneratedProfile(result.output,player);if(validation.valid){accepted=result.output;break;}warn(`${player.fullName} (${id}) output rejected: ${validation.errors.join("; ")}`);}catch(e){summary.requests++;const usage=e.usage||{inputTokens:0,cachedInputTokens:0,outputTokens:0,reasoningTokens:0},cost=estimateCost(usage,rates);summary.inputTokens+=usage.inputTokens;summary.cachedInputTokens+=usage.cachedInputTokens;summary.outputTokens+=usage.outputTokens;summary.estimatedRunCostUsd+=cost;m.requests++;m.inputTokens+=usage.inputTokens;m.cachedInputTokens+=usage.cachedInputTokens;m.outputTokens+=usage.outputTokens;m.reasoningTokens+=usage.reasoningTokens;m.estimatedCostUsd+=cost;m.models[model]=(m.models[model]||0)+1;m.lastUpdatedAt=now.toISOString();ledger.months[month]=m;atomicWrite(ledgerPath,ledger);warn(`${player.fullName} (${id}) profile request failed: ${e.message}`);if(e.stopRun){stop=true;break;}validation={errors:[e.message],outputFailure:e.outputFailure};if(e.outputFailure==="max_output_tokens"&&!configuredMax)retryLimit=Math.ceil(max*1.2);if(!e.retryableOutput)break;}}
      if(!accepted){summary.preserved+=validOld?1:0;continue;}profiles[id]={playerId:id,name:player.fullName,position:player.position,...accepted,generation:{model,promptVersion,inputHash:hash,providerPlayerId:player.providerPlayerId,generatedAt:now.toISOString(),usage:{inputTokens:lastUsage.inputTokens,outputTokens:lastUsage.outputTokens,estimatedCostUsd:estimateCost(lastUsage,rates)}}};summary.generated++;atomicWrite(artifactPath,{...existingArtifact,season:nflData.season??existingArtifact.season,updatedAt:now.toISOString(),profiles});}
    summary.monthlyCostUsd=m.estimatedCostUsd;summary.remainingMonthlyBudgetUsd=Math.max(0,monthlyBudget-m.estimatedCostUsd);return summary;
  }finally{for(const [signal,handler] of signalHandlers)process.removeListener(signal,handler);releaseLock();}
}
