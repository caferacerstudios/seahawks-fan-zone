import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isCurrentRosterPlayer } from "./roster.mjs";

export const PROMPT_VERSION = "professional-player-profile-v3-tiered";
export const DEFAULT_MODEL = "gpt-5.4-mini";
export const PROFILE_TIERS = ["featured", "core", "contributor", "developmental"];
export const TIER_MAX_OUTPUT_TOKENS = { featured:1700, core:1300, contributor:900, developmental:650 };
export const DEFAULT_MAX_OUTPUT_TOKENS = TIER_MAX_OUTPUT_TOKENS.contributor;
export const DEFAULT_RATES = { "gpt-5.4-mini": { input: 0.75, output: 4.5 } };
const PHRASES = ["brings energy","looks to make an impact","aims to contribute","poised for","dynamic playmaker","valuable asset","key contributor","veteran presence","one to watch","continues to develop","adds depth","plays with passion","has the potential to","is listed on the roster","the roster lists","season statistics include","the supplied data","for this profile"];

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
export function createSeasonStatisticFacts(playerId, season, scope, statistics = {}) {
  if (season == null) return [];
  const normalizedScope = String(scope || "regular").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "regular";
  return Object.entries(statistics).map(([field,value]) => ({
    id:`${playerId}:${season}:${normalizedScope}:${field}`,
    type:"seasonStatistic",
    season,
    scope:normalizedScope,
    field,
    value,
  }));
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
    const seasonStatisticFacts=createSeasonStatisticFacts(canonicalRosterId,playerStatsSeason,"regular",stats);
    return { canonicalRosterId, providerPlayerId:match?.providerPlayerId || career?.providerPlayerId || null, fullName:roster.name, position:roster.position || pos(provider) || null, jerseyNumber:roster.number ?? number(provider), height:roster.height ?? provider?.height ?? null, weight:roster.weight ?? provider?.weight ?? null, college:roster.college ?? provider?.college ?? null, experience:roster.experience ?? roster.years_pro ?? provider?.experience ?? provider?.years_pro ?? null, rosterStatus:roster.status, profileTier:resolveProfileTier(canonicalRosterId,tierStore,meaningful,log), playerStatsSeason, statisticsScope:Object.keys(stats).length ? "regular" : null, statistics:stats, seasonStatisticFacts, careerFacts:career, editorialFacts:extra.editorialFacts };
  });
}
function canonical(v) { if (Array.isArray(v)) return v.map(canonical); if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).filter((k)=>!["reviewedAt","updatedAt","accessedAt","generatedAt"].includes(k)).sort().map((k)=>[k,canonical(v[k])])); return v; }
export function semanticInputHash(player, model, promptVersion = PROMPT_VERSION) { return crypto.createHash("sha256").update(JSON.stringify(canonical({player,model,promptVersion}))).digest("hex"); }

export const SYSTEM_PROMPT = "You are the copy editor for an independent football reference publication. Write concise, publication-quality Seattle Seahawks player profiles in neutral third-person language. Use only facts included in the supplied JSON. Never rely on outside knowledge or infer missing information. Do not speculate about depth-chart position, health, future performance, leadership, personality, contracts, or playing style. Avoid hype, clichés, fan language, first-person plural language, rhetorical questions, exclamation points, and em dashes. If the available data is sparse, write less rather than filling space with generic statements. Do not discuss injury status. Output must exactly match the requested JSON schema.";
const nullableString={anyOf:[{type:"string"},{type:"null"}]};
const sourcedText={type:"object",additionalProperties:false,properties:{text:{type:"string"},factIds:{type:"array",items:{type:"string"}}},required:["text","factIds"]};
export const PROFILE_SCHEMA = {type:"object",additionalProperties:false,properties:{profileTier:{type:"string",enum:PROFILE_TIERS},dek:nullableString,biography:{type:"object",additionalProperties:false,properties:{overview:nullableString,careerContext:nullableString,seahawksContext:nullableString},required:["overview","careerContext","seahawksContext"]},careerHighlights:{type:"array",maxItems:6,items:sourcedText},seasonOverview:{anyOf:[{type:"null"},{type:"object",additionalProperties:false,properties:{paragraph:{type:"string"},bullets:{type:"array",maxItems:3,items:sourcedText}},required:["paragraph","bullets"]}]},usedFactIds:{type:"array",items:{type:"string"}}},required:["profileTier","dek","biography","careerHighlights","seasonOverview","usedFactIds"]};
const DEPTH={featured:{dek:"20-35 words",overview:"80-120 words",context:"80-130 career and 70-110 Seattle words",highlights:"4-6 distinct bullets",season:"75-110 words"},core:{dek:"15-30 words",overview:"70-110 words",context:"one 70-110 word career or Seattle paragraph",highlights:"3-4 distinct bullets",season:"60-90 words"},contributor:{dek:"null",overview:"60-100 words",context:"optional 40-70 words",highlights:"2-3 bullets",season:"short only if meaningful"},developmental:{dek:"null",overview:"60-100 words maximum",context:"only verified draft, signing, college, or acquisition context",highlights:"0-2 bullets",season:"null without meaningful professional statistics"}};
export function suppliedFacts(player) { return [...(player.editorialFacts||[]),...(player.careerFacts?.sourceFacts||[]),...(player.seasonStatisticFacts||[])]; }
export function knownFactIds(player) { return new Set(suppliedFacts(player).map((fact)=>fact?.id).filter(Boolean)); }
export function buildProfilePrompt(player, repairFeedback = null) { const tier=PROFILE_TIERS.includes(player.profileTier)?player.profileTier:"contributor"; return [{role:"system",content:SYSTEM_PROMPT},{role:"user",content:JSON.stringify({profileTierLocked:tier,verifiedPlayerFacts:player,verifiedFacts:suppliedFacts(player),instructions:{tierDepth:DEPTH[tier],editorialSeparation:"Hero owns number, position, height, weight, college, experience, and roster status. Do not repeat those fields. Biography owns career progression; Seattle context owns acquisition and Seattle tenure; highlights own honors and milestones; season overview interprets selected statistics without transcribing cards. A numeric fact should normally appear once.",factTraceability:"Every highlight and season bullet must cite supplied fact IDs. Use only exact fact IDs supplied in verifiedFacts. Never construct, shorten, infer, or transform a fact ID. profileTier must exactly equal profileTierLocked. usedFactIds must contain only supplied fact IDs.",seasonOverview:Object.keys(player.statistics||{}).length||(player.careerFacts?.recentSeasons||[]).length?`Use the latest completed ${player.playerStatsSeason||"stored"} season statistics and supplied deterministic comparisons.`:"Return null because no meaningful verified statistics are available.",prohibitedPhrases:PHRASES,repairFeedback}})}]; }
export function requestBody(model, player, max = null, repair = null) { const limit=max??TIER_MAX_OUTPUT_TOKENS[player.profileTier]??TIER_MAX_OUTPUT_TOKENS.contributor; return {model,reasoning:{effort:"low"},input:buildProfilePrompt(player,repair),text:{verbosity:"low",format:{type:"json_schema",name:"player_profile",strict:true,schema:PROFILE_SCHEMA}},max_output_tokens:limit}; }
const wordCount = (v) => String(v||"").trim().split(/\s+/).filter(Boolean).length;
export function validateGeneratedProfile(output, player) {
  const errors=[], sections=[output?.dek,output?.biography?.overview,output?.biography?.careerContext,output?.biography?.seahawksContext,output?.seasonOverview?.paragraph], bullets=[...(output?.careerHighlights||[]).map(x=>x?.text),...(output?.seasonOverview?.bullets||[]).map(x=>x?.text)], copy=[...sections,...bullets].filter(Boolean).join(" ");
  if(!output||output.profileTier!==player.profileTier||!output.biography||!("seasonOverview" in (output||{}))||!Array.isArray(output?.careerHighlights)||!Array.isArray(output?.usedFactIds)) errors.push("required structured fields are missing or tier changed");
  const limits={featured:{dek:35,overview:120,career:130,seattle:110,season:110},core:{dek:30,overview:110,career:110,seattle:110,season:90},contributor:{dek:0,overview:100,career:70,seattle:70,season:70},developmental:{dek:0,overview:100,career:70,seattle:70,season:0}}[player.profileTier]||{};
  for(const [key,value,max] of [["dek",output?.dek,limits.dek],["overview",output?.biography?.overview,limits.overview],["career context",output?.biography?.careerContext,limits.career],["Seattle context",output?.biography?.seahawksContext,limits.seattle],["season overview",output?.seasonOverview?.paragraph,limits.season]]) if(value&&wordCount(value)>max) errors.push(`${key} exceeds ${max} words`);
  const rich=(player.editorialFacts||[]).length>=5&&(player.careerFacts?.recentSeasons||[]).length>0;
  if(player.profileTier==="featured"&&rich&&(!output.dek||!output.biography.overview||!output.biography.careerContext||!output.biography.seahawksContext||output.careerHighlights.length<4||!output.seasonOverview)) errors.push("featured profile with rich facts is missing required depth");
  if(!Object.keys(player.statistics||{}).length&&!(player.careerFacts?.recentSeasons||[]).length&&output?.seasonOverview!==null) errors.push("season overview exists without verified statistics");
  const known=knownFactIds(player); for(const id of [...(output?.usedFactIds||[]),...(output?.careerHighlights||[]).flatMap(x=>x.factIds||[]),...(output?.seasonOverview?.bullets||[]).flatMap(x=>x.factIds||[])]) if(!known.has(id)) errors.push(`unknown fact ID: ${id}`);
  const normalized=(s)=>String(s||"").toLowerCase().replace(/[^a-z0-9 ]/g,"").replace(/\s+/g," ").trim(), seen=new Set(); for(const sentence of copy.split(/[.!?]+/).map(normalized).filter((x)=>x.split(" ").length>=4)){if(seen.has(sentence))errors.push(`duplicate sentence: ${sentence}`);seen.add(sentence);} const bulletKeys=bullets.map(normalized).filter(Boolean); if(new Set(bulletKeys).size!==bulletKeys.length)errors.push("duplicate bullet");
  if (/\b(we|our|ours|us)\b/i.test(copy)) errors.push("first-person fan language is prohibited"); if (/[—!]/.test(copy)) errors.push("em dashes and exclamation points are prohibited");
  if (/\b(?:health|healthy|injur(?:y|ed|ies))\b/i.test(copy)) errors.push("health and injury commentary is prohibited");
  for (const phrase of PHRASES) if (copy.toLowerCase().includes(phrase)) errors.push(`prohibited phrase: ${phrase}`);
  const facts=suppliedFacts(player), hasType=(type)=>facts.some((fact)=>fact?.type===type), factText=(fact)=>JSON.stringify(fact?.value||{}).toLowerCase();
  const hasAcquisitionFact=()=>facts.some((fact)=>fact?.type==="acquisition"&&/sign|free agent/.test(factText(fact)));
  const hasDraftFact=()=>hasType("draftSelection");
  const hasTradeFact=()=>facts.some((fact)=>["trade","acquisition"].includes(fact?.type)&&/trade/.test(factText(fact)));
  const hasStartingRoleFact=()=>facts.some((fact)=>fact?.type==="currentRole"&&/\bstart(?:er|ing)\b/.test(factText(fact)));
  const hasCaptainFact=()=>facts.some((fact)=>fact?.type==="captain");
  const checks=[[/\b(?:signed|signing|joined as (?:an? )?[^.]*free agent)\b/i,"signed",hasAcquisitionFact],[/\b(?:drafted|draft selection)\b/i,"drafted",hasDraftFact],[/\b(?:traded|acquired (?:in|via) (?:a )?trade)\b/i,"traded",hasTradeFact],[/\b(?:starter|starting (?:quarterback|[a-z]+))\b/i,"starter",hasStartingRoleFact],[/\bcaptain\b/i,"captain",hasCaptainFact],[/\bformerly\b/i,"formerly",()=>hasType("teamHistory")]];
  for(const [pattern,label,supported] of checks) if(pattern.test(copy)&&!supported()) errors.push(`unsupported claim: ${label}`);
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
  for(let attempt=1;attempt<=3;attempt++){try{const res=await fetchImpl("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body)});if(res.ok){const json=await res.json(),d=json.usage?.input_tokens_details||{},o=json.usage?.output_tokens_details||{},usage={inputTokens:Number(json.usage?.input_tokens||0),cachedInputTokens:Number(d.cached_tokens||0),outputTokens:Number(json.usage?.output_tokens||0),reasoningTokens:Number(o.reasoning_tokens||0)};const incompleteReason=json.incomplete_details?.reason;if(json.status==="incomplete"||incompleteReason){const e=new Error(`incomplete response${incompleteReason?`: ${incompleteReason}`:""}`);e.retryableOutput=true;e.usage=usage;throw e;}if(json.status&&json.status!=="completed"){const e=new Error(`non-completed response: ${json.status}`);e.retryableOutput=true;e.usage=usage;throw e;}const text=responseText(json);if(!text){const refused=json?.output?.flatMap((x)=>x?.content||[]).some((x)=>x?.type==="refusal");const e=new Error(refused?"model refusal":"missing structured output");e.retryableOutput=true;e.usage=usage;throw e;}try{return{output:JSON.parse(text),usage};}catch{const e=new Error("invalid structured output");e.retryableOutput=true;e.usage=usage;throw e;}}let code="";try{code=(await res.json())?.error?.code||"";}catch{}const terminal=["credit_balance_exhausted","insufficient_quota"].includes(code),retryable=[429,500,502,503,504].includes(res.status)&&!terminal;if(!retryable||attempt===3){const e=new Error(`OpenAI request failed: HTTP ${res.status}${code?` (${code})`:""}`);e.stopRun=terminal||res.status===429;throw e;}const retry=Number(res.headers?.get?.("retry-after")),delay=Number.isFinite(retry)?retry*1000:500*2**(attempt-1);warn(`OpenAI HTTP ${res.status}; retrying after ${delay}ms.`);await sleep(delay);}catch(e){if(e.retryableOutput||e.stopRun||attempt===3||!/fetch|network|socket|ECONN|ETIMEDOUT/i.test(String(e.message)))throw e;await sleep(500*2**(attempt-1));}}
}
function repairInstructions(errors=[]) { return errors.map((error)=>error.startsWith("duplicate sentence: ")?`Remove or rewrite this duplicated sentence: ${error.slice("duplicate sentence: ".length)}`:error).join("; "); }
function acquireLock(file,staleMs,now,warn){fs.mkdirSync(path.dirname(file),{recursive:true});try{const fd=fs.openSync(file,"wx");fs.writeFileSync(fd,JSON.stringify({pid:process.pid,createdAt:now.toISOString()}));fs.closeSync(fd);return true;}catch(e){if(e.code!=="EEXIST")throw e;const lock=readJson(file,{}),age=now-Date.parse(lock.createdAt||0);if(Number.isFinite(age)&&age>staleMs){warn(`Removing abandoned player-profile lock older than ${staleMs}ms.`);fs.unlinkSync(file);return acquireLock(file,staleMs,now,warn);}return false;}}

export async function runPlayerProfileGeneration({rosterStore,nflData,playerDirectory=[],tierStore={},careerStore={},editorialStore={},existingArtifact={profiles:{}},artifactPath,ledgerPath,lockPath,env=process.env,fetchImpl=globalThis.fetch,now=new Date(),warn=console.warn,sleep=(ms)=>new Promise((r)=>setTimeout(r,ms))}) {
  const model=env.PLAYER_PROFILE_MODEL||DEFAULT_MODEL,promptVersion=env.PLAYER_PROFILE_PROMPT_VERSION||PROMPT_VERSION,configuredMax=env.PLAYER_PROFILE_MAX_OUTPUT_TOKENS?Number(env.PLAYER_PROFILE_MAX_OUTPUT_TOKENS):null,monthlyBudget=Number(env.PLAYER_PROFILE_MONTHLY_BUDGET_USD||20),runBudget=Number(env.PLAYER_PROFILE_RUN_BUDGET_USD||1),maxGen=Number(env.PLAYER_PROFILE_MAX_GENERATIONS_PER_RUN||125),refresh=env.PLAYER_PROFILE_REFRESH_MODE||(env.FORCE==="1"?"all":"stale"),rates=ratesFor(model,env),summary={considered:0,current:0,generated:0,insufficient:0,preserved:0,requests:0,inputTokens:0,cachedInputTokens:0,outputTokens:0,estimatedRunCostUsd:0,monthlyCostUsd:0,remainingMonthlyBudgetUsd:monthlyBudget,lockSkipped:false};
  if(!acquireLock(lockPath,Number(env.PLAYER_PROFILE_LOCK_STALE_MS||1800000),now,warn)){summary.lockSkipped=true;warn("Another player-profile refresh is active; using the last-known-good artifact without OpenAI requests.");return summary;}
  try{const players=enrichRoster(rosterStore,nflData,playerDirectory,warn,tierStore,careerStore,editorialStore).filter((p)=>!env.PLAYER_PROFILE_ID||p.canonicalRosterId===env.PLAYER_PROFILE_ID);summary.considered=players.length;const profiles={...(existingArtifact.profiles||{})},ledger=readJson(ledgerPath,{schemaVersion:1,months:{}}),month=now.toISOString().slice(0,7),m=ledger.months[month]||{requests:0,inputTokens:0,cachedInputTokens:0,outputTokens:0,reasoningTokens:0,estimatedCostUsd:0,models:{}};let stop=false;
    for(const player of players){const id=player.canonicalRosterId,old=profiles[id],max=configuredMax??TIER_MAX_OUTPUT_TOKENS[player.profileTier]??DEFAULT_MAX_OUTPUT_TOKENS,hash=semanticInputHash(player,model,promptVersion),validOld=Boolean(String(old?.bio||old?.biography?.overview||"").trim()),stale=!validOld||old?.generation?.model!==model||old?.generation?.promptVersion!==promptVersion||old?.generation?.inputHash!==hash;if(refresh!=="all"&&!stale){summary.current++;continue;}if(stop){summary.preserved+=validOld?1:0;continue;}const worst=(4000*rates.input+max*rates.output)/1e6;if(summary.requests>=maxGen||summary.estimatedRunCostUsd+worst>runBudget||m.estimatedCostUsd+worst>monthlyBudget){warn("Player-profile request or spending limit reached; retaining remaining profiles.");stop=true;summary.preserved+=validOld?1:0;continue;}if(!env.OPENAI_API_KEY){warn(`No OPENAI_API_KEY; preserving ${id}.`);summary.preserved+=validOld?1:0;continue;}let accepted=null,validation=null,lastUsage=null;
      for(let repair=0;repair<2;repair++){if(summary.requests>=maxGen||summary.estimatedRunCostUsd+worst>runBudget||m.estimatedCostUsd+worst>monthlyBudget){warn("Player-profile spending limit prevented a repair request.");stop=true;break;}try{const result=await callOpenAI(fetchImpl,env.OPENAI_API_KEY,requestBody(model,player,max,repair?repairInstructions(validation?.errors):null),sleep,warn);summary.requests++;lastUsage=result.usage;const cost=estimateCost(result.usage,rates);summary.inputTokens+=result.usage.inputTokens;summary.cachedInputTokens+=result.usage.cachedInputTokens;summary.outputTokens+=result.usage.outputTokens;summary.estimatedRunCostUsd+=cost;m.requests++;m.inputTokens+=result.usage.inputTokens;m.cachedInputTokens+=result.usage.cachedInputTokens;m.outputTokens+=result.usage.outputTokens;m.reasoningTokens+=result.usage.reasoningTokens;m.estimatedCostUsd+=cost;m.models[model]=(m.models[model]||0)+1;m.lastUpdatedAt=now.toISOString();ledger.months[month]=m;atomicWrite(ledgerPath,ledger);validation=validateGeneratedProfile(result.output,player);if(validation.valid){accepted=result.output;break;}warn(`${player.fullName} (${id}) output rejected: ${validation.errors.join("; ")}`);}catch(e){summary.requests++;const usage=e.usage||{inputTokens:0,cachedInputTokens:0,outputTokens:0,reasoningTokens:0},cost=estimateCost(usage,rates);summary.inputTokens+=usage.inputTokens;summary.cachedInputTokens+=usage.cachedInputTokens;summary.outputTokens+=usage.outputTokens;summary.estimatedRunCostUsd+=cost;m.requests++;m.inputTokens+=usage.inputTokens;m.cachedInputTokens+=usage.cachedInputTokens;m.outputTokens+=usage.outputTokens;m.reasoningTokens+=usage.reasoningTokens;m.estimatedCostUsd+=cost;m.models[model]=(m.models[model]||0)+1;m.lastUpdatedAt=now.toISOString();ledger.months[month]=m;atomicWrite(ledgerPath,ledger);warn(`${player.fullName} (${id}) profile request failed: ${e.message}`);if(e.stopRun){stop=true;break;}validation={errors:[e.message]};if(!e.retryableOutput)break;}}
      if(!accepted){summary.preserved+=validOld?1:0;continue;}profiles[id]={playerId:id,name:player.fullName,position:player.position,...accepted,generation:{model,promptVersion,inputHash:hash,providerPlayerId:player.providerPlayerId,generatedAt:now.toISOString(),usage:{inputTokens:lastUsage.inputTokens,outputTokens:lastUsage.outputTokens,estimatedCostUsd:estimateCost(lastUsage,rates)}}};summary.generated++;}
    if(summary.generated)atomicWrite(artifactPath,{...existingArtifact,season:nflData.season??existingArtifact.season,updatedAt:now.toISOString(),profiles});summary.monthlyCostUsd=m.estimatedCostUsd;summary.remainingMonthlyBudgetUsd=Math.max(0,monthlyBudget-m.estimatedCostUsd);return summary;
  }finally{try{fs.unlinkSync(lockPath);}catch{}}
}
