export const NEWS_CATEGORIES = ["News", "Analysis", "Roster", "Injuries", "Game Week", "Hard Knocks", "NFC West"] as const;

export type NewsCategory = typeof NEWS_CATEGORIES[number];
export type PublicationStatus = "draft" | "published" | "archived";

export interface NewsSource {
  label: string;
  url: string;
}

export interface HeroAsset {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface NewsArticle {
  slug: string;
  headline: string;
  dek: string;
  publishedAt: string;
  updatedAt: string;
  author: string;
  category: NewsCategory;
  tags: string[];
  season: number | null;
  opponent: string | null;
  body: ArticleBodyBlock[];
  sources: NewsSource[];
  hero: HeroAsset;
  featured: boolean;
  status: PublicationStatus;
}

export type ArticleBodyBlock = string
  | { type: "heading"; heading: string }
  | { type: "paragraph"; html: string }
  | { type: "rosterTable"; caption: string; rows: { position: string; players: string; status: string; role: string }[] }
  | { type: "timeline" | "watchlist"; items: { label: string; html: string }[] }
  | { type: "factbox"; heading: string; known: string[]; unknown: string[]; milestone: string };

const sharedHero: HeroAsset = {
  src: "/images/news/newsroom-field.svg",
  alt: "Abstract football field lines in Seahawks Fan Zone colors",
  width: 1200,
  height: 675,
};

const articles: NewsArticle[] = [
  {
    slug: "seahawks-roster-cutdown-board-2026",
    headline: "Seahawks roster cutdown board: The decisions shaping the initial 53",
    dek: "A clearly labeled projection, built from Seattle's official camp roster, official moves and role evidence through August 28.",
    publishedAt: "2026-08-28", updatedAt: "2026-08-28", author: "Seahawks Fan Zone Editorial Team", category: "Roster",
    tags: ["2026 roster", "Cutdown", "Projection", "Special teams"], season: 2026, opponent: null, featured: true, status: "published",
    hero: sharedHero,
    body: [
      { type: "paragraph", html: "<strong>This is a projection, not Seattle's initial 53-player roster.</strong> The Seahawks had not announced final cuts as of our August 28 check. Seattle's official roster page listed 91 active camp players and four players on Reserve/Injured. The club also announced an August 27 waiver claim for tackle Kellen Diesch that the roster page had not yet reflected. We record that claim in the <a href=\"/team/transactions\">transaction tracker</a>, but do not silently force the two official sources to agree." },
      { type: "heading", heading: "The rules that shape the board" },
      { type: "paragraph", html: "Seattle must reduce to 53 active players by August 30. A player moved to Reserve/Injured before the initial 53 generally cannot return for that club during the season, which is why the timing of an injury move matters. A player who remains on preseason PUP at the deadline can move to reserve/PUP without occupying one of the 53 spots, but must miss at least four games. Zach Charbonnet is listed as active on the official roster page after beginning camp on PUP, so this projection treats him as an active-roster decision unless the club announces another status change." },
      { type: "paragraph", html: "Players with fewer than four accrued seasons are generally exposed to waivers when released. Vested veterans become free agents. That distinction affects whether Seattle can realistically bring a player back. The practice squad can hold 16 players under the standard rules, with limited veteran exceptions, but Seattle must first accept waiver risk for eligible players. Game-day value also matters: a bottom-of-roster receiver, linebacker or safety who covers kicks may dress ahead of a more specialized reserve." },
      { type: "heading", heading: "Quarterback" },
      { type: "paragraph", html: "<strong>Roster locks:</strong> Sam Darnold and Drew Lock. <strong>Strong position:</strong> Jalen Milroe. Seattle returned all three quarterbacks, and the club has described a developmental offensive role for Milroe. Lock's strong first quarter against Tennessee reinforced the value of an experienced No. 2. Keeping three costs a spot elsewhere, but waiving Milroe would expose a 2025 third-round pick whose rushing skill is not duplicated in the room." },
      { type: "heading", heading: "Running back and fullback" },
      { type: "paragraph", html: "<strong>Roster locks:</strong> Jadarian Price and Zach Charbonnet, subject to Charbonnet's official availability. <strong>Strong positions:</strong> Emanuel Wilson, George Holani and Brady Russell. <strong>True bubble:</strong> Jacardia Wright versus a fourth healthy back if Charbonnet is not ready. Price is the first-round runner, Wilson supplies size, and Holani has recent offensive and special-teams experience. Russell played fullback and core special teams in 2025. Keeping Wright would protect the early rushing rotation, but it would probably cost a sixth receiver or tenth offensive lineman. His production against Tennessee is useful evidence, not proof from one game." },
      { type: "heading", heading: "Wide receiver" },
      { type: "paragraph", html: "<strong>Roster locks:</strong> Jaxon Smith-Njigba, Cooper Kupp and Rashid Shaheed. <strong>Strong positions:</strong> Tory Horton and Irv Charles. <strong>True bubble:</strong> Montorie Foster Jr. against Emmanuel Henderson Jr. Foster led Seattle in receiving and scored in the opener. Charles was acquired with special-teams value central to the move. Henderson offers developmental upside and coverage value, while Foster has supplied more visible preseason receiving production. Choosing Foster risks losing a sixth-round rookie; choosing Henderson gives up a reserve who has already translated camp work into game production. Jake Bobo is on Reserve/Injured and is not part of this 53." },
      { type: "heading", heading: "Tight end" },
      { type: "paragraph", html: "<strong>Roster locks:</strong> AJ Barner and Elijah Arroyo. <strong>True bubble:</strong> Eric Saubert versus Nick Vannett. Barner's receiving, blocking and short-yardage roles make him central to the offense. Arroyo adds movement and receiving ability. The third choice is likely driven by in-line blocking and special teams. Saubert has continuity; Vannett was signed at camp's start as another veteran blocking option. Carrying four would squeeze receiver or offensive-line depth." },
      { type: "heading", heading: "Offensive line" },
      { type: "paragraph", html: "<strong>Roster locks:</strong> Charles Cross, Grey Zabel, Jalen Sundell, Anthony Bradford and Abraham Lucas. <strong>Strong positions:</strong> Olu Oluwatimi, Christian Haynes, Josh Jones and Amari Kight. <strong>True bubble:</strong> Beau Stephens against a tenth lineman. Richman's injured-reserve move removed the unit's most flexible reserve, increasing the value of Jones at guard and tackle and Oluwatimi at center. Stephens has draft investment, but a developmental guard must beat the game-day flexibility of veterans. The alternative is carrying ten and trimming a coverage player." },
      { type: "heading", heading: "Defensive line" },
      { type: "paragraph", html: "<strong>Roster locks:</strong> Leonard Williams, Byron Murphy II and Jarran Reed. <strong>Strong positions:</strong> Rylie Mills, Mike Morris and Brandon Pili. <strong>True bubble:</strong> Uso Seumalo versus Deven Eastern. Seattle's official camp preview called the front a team strength after a 47-sack season and league-low 3.7 yards allowed per rush. Morris offers length and positional flexibility, while Pili supplies proven nose-tackle depth. A seventh interior player improves rotation insurance but costs a spot in the secondary or on special teams." },
      { type: "heading", heading: "Edge" },
      { type: "paragraph", html: "<strong>Roster locks:</strong> DeMarcus Lawrence, Uchenna Nwosu, Derick Hall and Dante Fowler Jr. <strong>Strong position:</strong> Jared Ivey. The top four supply established run defense and pass rush. Ivey is the younger reserve who can preserve their workload and contribute on coverage units. Keeping a sixth edge would mean losing a player at a thinner position, so this is one of the clearest rooms on the board." },
      { type: "heading", heading: "Linebacker" },
      { type: "paragraph", html: "<strong>Roster locks:</strong> Ernest Jones IV and Drake Thomas. <strong>Strong positions:</strong> Tyrice Knight and Chazz Surratt. Knight's opener, when the team called him its best defensive player on the field, supports a defensive role in addition to his established special-teams work. Surratt also has core special-teams value. Chris Paul Jr. is the likely practice-squad candidate in this projection. Keeping a fifth off-ball linebacker would protect against injury but duplicate coverage roles available at safety and edge." },
      { type: "heading", heading: "Cornerback" },
      { type: "paragraph", html: "<strong>Roster locks:</strong> Devon Witherspoon and Josh Jobe. <strong>Strong positions:</strong> Trevon Diggs, Noah Igbinoghene and rookie Julian Neal. <strong>True bubble:</strong> Nehemiah Pritchett against a sixth corner. Diggs' August 19 signing changes the third-corner calculation, but his exact game-day workload remains unannounced. Neal brings draft investment; Igbinoghene and Pritchett must make their cases through outside depth and special teams. A sixth corner is defensible in a defense that uses many defensive backs, but safety became thinner after Bud Clark's injury." },
      { type: "heading", heading: "Safety" },
      { type: "paragraph", html: "<strong>Roster locks:</strong> Julian Love, Nick Emmanwori and Ty Okada. <strong>True bubble:</strong> AJ Finley versus D'Anthony Bell. Emmanwori's ability to cover the slot, set an edge, rush and align at linebacker lets Seattle change personnel without substituting. Clark's broken ankle removes a projected contributor. Bell worked with the first unit while Emmanwori ramped back up; Finley offers special-teams value after returning from a missed season. Keeping only four safeties makes one injury immediately consequential." },
      { type: "heading", heading: "Specialists" },
      { type: "paragraph", html: "<strong>Roster locks:</strong> Jason Myers, Michael Dickson and Chris Stoll. There is no second kicker, punter or long snapper on the official roster page. Their three places are stable, while the coverage and return units influence the receiver, linebacker and defensive-back margins. Shaheed's return role is secure; Charles, Knight, Surratt and Russell gain value because they can fill coverage jobs without requiring specialist-only roster places." },
      { type: "rosterTable", caption: "Projected initial 53, plus one PUP contingency", rows: [
        {position:"QB",players:"Darnold, Lock, Milroe",status:"Projected active",role:"Starter, veteran backup, developmental package"},
        {position:"RB/FB",players:"Price, Charbonnet, Wilson, Holani, Russell",status:"Projected active",role:"Four-runner plan and core special teams"},
        {position:"WR",players:"Smith-Njigba, Kupp, Shaheed, Horton, Charles, Foster",status:"Projected active",role:"Top three, vertical depth, return and coverage work"},
        {position:"TE",players:"Barner, Arroyo, Saubert",status:"Projected active",role:"Receiving, blocking and special teams"},
        {position:"OL",players:"Cross, Zabel, Sundell, Bradford, Lucas, Oluwatimi, Haynes, Jones, Kight",status:"Projected active",role:"Five starters and four multiposition reserves"},
        {position:"DL",players:"Williams, Murphy, Reed, Mills, Morris, Pili",status:"Projected active",role:"Interior rush and run rotation"},
        {position:"Edge",players:"Lawrence, Nwosu, Hall, Fowler, Ivey",status:"Projected active",role:"Four-man veteran rotation plus young depth"},
        {position:"LB",players:"E. Jones, D. Thomas, Knight, Surratt",status:"Projected active",role:"Two starters and two core special-teamers"},
        {position:"CB",players:"Witherspoon, Jobe, Diggs, Igbinoghene, Neal",status:"Projected active",role:"Outside, slot and developmental depth"},
        {position:"S",players:"Love, Emmanwori, Okada, Finley",status:"Projected active",role:"Three defensive roles and one coverage reserve"},
        {position:"ST",players:"Myers, Dickson, Stoll",status:"Projected active",role:"Kicker, punter and long snapper"},
        {position:"Contingency",players:"Charbonnet",status:"PUP only if officially retained there",role:"Would not count in the 53 and would open one place"}
      ]},
      { type: "heading", heading: "Where the roster is strongest" },
      { type: "paragraph", html: "The defensive front has the best combination of top-end play and rotation depth. Williams, Murphy and Reed anchor the interior, while Lawrence, Nwosu, Hall and Fowler give Seattle four experienced edge options. Tight end is also structurally strong because Barner can block and receive, Arroyo can stretch coverages, and the third player can be selected for game-day blocking and coverage work." },
      { type: "heading", heading: "Where one injury changes the picture" },
      { type: "paragraph", html: "Safety is the clearest pressure point after Clark's injury. Love, Emmanwori and Okada can cover many assignments, but the fourth choice may need to play immediately. Running back is similarly sensitive until Seattle gives a new sourced update on Charbonnet. Offensive-line flexibility also declined when Richman went to injured reserve. One tackle injury could force Josh Jones or Kight into a larger role and leave fewer interior alternatives." },
      { type: "heading", heading: "What can still change" },
      { type: "paragraph", html: "Seattle still has a final preseason game, and the August 30 list is only the first version. The club can claim players waived elsewhere, trade from a deep room, bring eligible cuts back to the practice squad, or arrange post-cutdown injured-reserve moves after first carrying a return-eligible player on the initial 53. The Diesch claim is a reminder that outside additions can arrive before Seattle finishes its own cuts. We will update the roster, transactions and <a href=\"/team/injuries\">injury-status tracker</a> only when a sourced move or status change is published." }
    ],
    sources: [
      {label:"Seattle Seahawks official roster, checked Aug. 28",url:"https://www.seahawks.com/team/players-roster/"},
      {label:"Seattle Seahawks official transactions",url:"https://www.seahawks.com/team/transactions/"},
      {label:"Seattle Seahawks: August 30 deadline and PUP explanation",url:"https://www.seahawks.com/news/why-nick-emmanwori-is-on-the-pup-list-other-seahawks-injury-updates"},
      {label:"Seattle Seahawks: Clark and Richman to injured reserve",url:"https://www.seahawks.com/news/seahawks-sign-three-free-agents-place-bud-clark-mason-richman-on-injured-reserve"},
      {label:"Seattle Seahawks: Bobo to injured reserve",url:"https://www.seahawks.com/news/seahawks-place-wr-jake-bobo-on-injured-reserve-sign-wr-julian-hicks"},
      {label:"Seattle Seahawks: 2026 position storylines",url:"https://www.seahawks.com/news/10-storylines-to-watch-in-2026-seahawks-training-camp"},
      {label:"Seattle Seahawks: preseason opener reactions",url:"https://www.seahawks.com/news/rapid-reactions-seahawks-fall-in-preseason-opener-to-the-cowboys"},
      {label:"Seattle Seahawks: preseason game at Tennessee",url:"https://www.seahawks.com/news/2026-preseason-week-2-rapid-reactions-seahawks-fall-to-the-titans-in-the-preseason-matchup"},
      {label:"Seattle Seahawks Fan Zone transactions tracker",url:"/team/transactions"},
      {label:"Seattle Seahawks Fan Zone injury-status tracker",url:"/team/injuries"}
    ]
  },
  {
    slug: "nfl-approves-seahawks-sale-khosla-family-what-changes",
    headline: "NFL approves Seahawks sale to Khosla family: What changes now and what remains unknown",
    dek: "The ownership vote is complete, but the deal has not formally closed. Here is who will control the team, what the family has committed to and which decisions will matter next.",
    publishedAt: "2026-08-28",
    updatedAt: "2026-08-28",
    author: "Seahawks Fan Zone Editorial Team",
    category: "Analysis",
    tags: ["Ownership", "Khosla family", "Paul Allen", "Lumen Field", "Analysis"],
    season: 2026,
    opponent: null,
    body: [
      { type: "paragraph", html: "NFL owners unanimously approved the sale of the Seattle Seahawks to the Khosla family on August 26. That was the transaction’s largest regulatory hurdle, but it was not the closing. As of this article’s August 28 update, the Seahawks’ own account called approval a step closer to completion, and current reporting still described formal closing as pending. The Paul G. Allen Estate therefore remains the owner until the parties finish that process." },
      { type: "paragraph", html: "That distinction matters because approval answers who the league will permit to buy the club, while closing transfers the club. It also keeps the immediate football picture in perspective. Seattle is entering a season as the defending champion with an established president of football operations/general manager, John Schneider, and head coach, Mike Macdonald. No public announcement has replaced either executive or reassigned roster authority." },

      { type: "heading", heading: "How Seattle reached this point" },
      { type: "timeline", items: [
        { label: "1997", html: "Paul Allen bought the Seahawks from Ken Behring for $194 million after obtaining an option on a franchise Behring had attempted to move. Washington voters approved Referendum 48, enabling the publicly owned stadium project and clearing the way for Allen’s purchase. The result kept the team in the Pacific Northwest and tied its future to the site now called Lumen Field." },
        { label: "2018", html: "Allen died in October. His sister, Jody Allen, became chair of the Seahawks and trustee of the Paul G. Allen Trust. The estate continued owning the club rather than beginning an immediate sale." },
        { label: "February 18, 2026", html: "The estate opened a formal sale process, naming Allen & Company and Latham & Watkins as advisers. It said a sale fulfilled Paul Allen’s direction to sell his sports holdings eventually and direct estate proceeds to philanthropy." },
        { label: "July 11, 2026", html: "The estate announced a binding sale agreement with a Khosla family-led group. The parties did not disclose terms. The Associated Press, citing a person familiar with the deal, reported a $9.612 billion price. That number is credible reporting, not an officially confirmed term." },
        { label: "August 26, 2026", html: "NFL owners voted unanimously to approve the purchase. League approval also required the Khoslas to give up their minority interest in the San Francisco 49ers, according to AP reporting." },
        { label: "Current status", html: "Formal closing remains the next milestone. No reliable public source reviewed for this article had confirmed completion by August 28." }
      ] },

      { type: "heading", heading: "Who will control the team?" },
      { type: "paragraph", html: "The most precise answer is Neeru Khosla. Reporting based on the NFL memo sent to clubs identifies her as the Seahawks’ controlling owner. That designation matters under league governance: the controlling owner is the family group’s principal representative and is accountable to the NFL for the franchise. The team’s July announcement used the broader formulation that the Khosla family would become the controlling owner, while the NFL’s approval coverage described the group as led by Vinod and Neeru Khosla." },
      { type: "paragraph", html: "Vinod Khosla is a co-owner and has been the family’s principal public voice. He delivered the family statement in July and answered questions after the league vote. Public visibility does not make him the controlling owner. His stated approach was long-term, centered on learning from existing management and sustaining success. Those are statements of intent, not a new reporting structure or a promise of a particular level of spending." },
      { type: "paragraph", html: "Their son Neal Khosla is a co-owner and, according to the NFL memo as reported by local and national outlets, is expected to have a significant leadership role in the ownership group. The exact title, decision rights and day-to-day portfolio have not been made public. Their daughter Nina Khosla joined Neeru, Vinod and Neal at the league meeting and was named in the Seahawks’ event coverage. No reviewed source assigned her an ownership, control or operating title. Attendance should not be converted into authority. The same rule applies to any other relatives or financial partners until the club or league documents their roles." },

      { type: "heading", heading: "What changes immediately?" },
      { type: "paragraph", html: "At closing, the ultimate authority over the franchise changes. The owner can set budgets, appoint senior business and football executives, approve major capital projects and establish the organization’s tolerance for risk. League rules still constrain the club: the salary cap limits player payroll, roster and contract rules govern acquisitions, and many ownership actions require league approval." },
      { type: "paragraph", html: "Ownership is not the same job as choosing the game-day roster. Schneider and Macdonald run football operations within the authority and resources ownership gives them. An owner can change that structure, but there is no evidence the Khoslas have done so. Vinod Khosla’s comment that the family would learn from management points toward continuity at the start. It is not a binding commitment to retain every executive." },
      { type: "paragraph", html: "<strong>Analysis:</strong> Immediate owner influence is usually clearest in areas fans do not see on Sundays: reporting lines, hiring authority, facilities, analytics and medical resources, business staffing, and the willingness to guarantee cash in contracts. The cap prevents a wealthy owner from simply purchasing an unlimited roster. That is why personal-wealth estimates say little about future football spending. The revealing evidence will be organizational decisions, not a valuation headline or a celebratory news conference." },

      { type: "heading", heading: "Lumen Field: a commitment to the brand, not yet a stadium plan" },
      { type: "paragraph", html: "Lumen Field is publicly owned by the Washington State Public Stadium Authority and operated under a master-lease structure involving First & Goal. The Seahawks’ lease runs through 2032 and includes three 10-year extension options, according to the NFL and AP. Those options create a possible long runway in the current building, but an option is not the same as a decision to exercise it." },
      { type: "paragraph", html: "After the approval vote, Vinod Khosla called Lumen Field <a href=\"https://www.nfl.com/news/nfl-owners-approve-sale-seattle-seahawks-khosla-family\">“iconic and very much a part of the Seahawks’ brand”</a>. He also said the group needed to learn and would work with management and the Seattle community. That is meaningful evidence against treating relocation or replacement as an announced plan. It is still symbolic language rather than a commitment to extend the lease, renovate the stadium or fund a replacement." },
      { type: "paragraph", html: "There is already a public maintenance framework. In 2026 the stadium authority considered a 2026-2030 major maintenance and modernization plan under the existing lease. Routine modernization should not be confused with a new Khosla ownership initiative. No reviewed source identifies an approved Khosla renovation package, replacement site, financing request or lease extension. Any major stadium project would involve the public owner, lease negotiations, financing, permits and community scrutiny. The first concrete signals will be formal studies, capital commitments or negotiations, not broad praise for the venue." },

      { type: "heading", heading: "Paul Allen’s legacy and the sale proceeds" },
      { type: "paragraph", html: "Allen’s ownership cannot be reduced to the appreciation from $194 million to a reported $9.612 billion. His 1997 intervention stopped a relocation attempt, and the stadium campaign anchored the franchise in Seattle. During the Allen years, the Seahawks reached four Super Bowls and won two, while the organization developed the stadium, training complex and a durable football operation. Jody Allen and the trust then held the club for nearly eight years after his death, including the 2025 championship season." },
      { type: "paragraph", html: "The estate says Paul Allen directed that his sports holdings eventually be sold and that all estate proceeds go to philanthropy. That establishes the destination in broad terms, not the timing, recipient organizations or allocation of the Seahawks proceeds. The official announcement did not publish those details, and the reported sale price should not be treated as the net charitable amount. Transaction costs, obligations and the estate’s process can affect what is ultimately distributed." },

      { type: "factbox", heading: "The transaction at a glance", known: [
        "NFL owners unanimously approved the Khosla family’s purchase on August 26.",
        "Neeru Khosla is the reported controlling owner; Vinod and Neal Khosla are co-owners.",
        "The official parties did not disclose the price. AP and ESPN reported $9.612 billion.",
        "The existing Lumen Field lease runs through 2032 with three 10-year options."
      ], unknown: [
        "The exact closing date and final ownership percentages.",
        "Neal Khosla’s formal title and operating responsibilities, and any role for Nina Khosla.",
        "Whether the group will exercise a lease option, pursue major renovations or study another stadium plan.",
        "Which philanthropic recipients will receive proceeds, in what amounts and on what schedule."
      ], milestone: "Formal closing. Until the Seahawks, the NFL or the Allen estate confirms it, the ownership transfer should not be described as complete." },

      { type: "heading", heading: "What to watch during the first year" },
      { type: "watchlist", items: [
        { label: "1. Executive structure", html: "Look for filed or announced changes to the president, general manager, head coach or senior business leadership, plus a formal title for Neal Khosla. No change is itself measurable evidence of continuity." },
        { label: "2. Football operations", html: "Track reporting lines, contract extensions for decision-makers and investments in scouting, analytics, sports science and facilities. These reveal owner priorities more clearly than public predictions about play-calling or personnel." },
        { label: "3. Stadium action", html: "Watch for an exercised lease option, a commissioned study, a capital plan agreed with the Public Stadium Authority or a public financing proposal. Each is more concrete than general comments about preserving Lumen Field." },
        { label: "4. Community commitments", html: "Measure new or renewed programs by published funding, duration, geographic reach and accountable partners. “Engagement” becomes operational only when the club attaches resources and goals." },
        { label: "5. Fan economics and experience", html: "Compare season-ticket and concession pricing, service policies, stadium technology and game-day changes with the prior season. Do not assume a record purchase price automatically produces higher prices or immediate upgrades." }
      ] },
      { type: "paragraph", html: "<strong>Analysis:</strong> The first year will test a simple divide. Stewardship language describes how the family wants to be understood. Choices about people, authority, facilities, community money and the fan experience will show how it intends to own the Seahawks. Until those choices arrive, continuity is the most supportable expectation, not a guarantee." }
    ],
    sources: [
      { label: "Seattle Seahawks: NFL owners approve sale (Aug. 26, 2026)", url: "https://www.seahawks.com/news/nfl-owners-approve-sale-of-seahawks-to-khosla-family" },
      { label: "Seattle Seahawks: Estate reaches sale agreement (July 11, 2026)", url: "https://www.seahawks.com/news/estate-of-paul-g-allen-reaches-agreement-to-sell-seattle-seahawks" },
      { label: "Seattle Seahawks: Estate begins sale process (Feb. 18, 2026)", url: "https://www.seahawks.com/news/estate-of-paul-g-allen-begins-sale-process-for-seattle-seahawks" },
      { label: "NFL.com: Owners approve sale to Khosla family", url: "https://www.nfl.com/news/nfl-owners-approve-sale-seattle-seahawks-khosla-family" },
      { label: "Associated Press: Khosla family agrees to purchase Seahawks", url: "https://apnews.com/article/seahawks-sold-0f721adeec4cc06b0093b552b858785d" },
      { label: "Associated Press: Allen estate begins Seahawks sale", url: "https://apnews.com/article/seattle-seahawks-sale-de44677992a36b2bb4d8d354342a8f6b" },
      { label: "NBC Sports: NFL memo identifies Khosla ownership roles", url: "https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/vinod-khoslas-wife-neeru-will-be-controlling-owner-of-seahawks" },
      { label: "Axios Seattle: Approval leaves formal closing ahead", url: "https://www.axios.com/local/seattle/2026/08/27/seahawks-sale-khosla-family-9-billion-allen-ownership" },
      { label: "Washington State Public Stadium Authority", url: "https://stadium.org/" },
      { label: "Lumen Field lease summary", url: "https://law.marquette.edu/assets/sports-law/pdf/Seattle%20Seahawks%20Lease%20Summary.pdf" },
      { label: "Seahawks Fan Zone history", url: "/history" },
      { label: "About Seahawks Fan Zone", url: "/about" },
      { label: "Seahawks Fan Zone methodology", url: "/methodology" }
    ],
    hero: {
      src: "/images/news/ownership-transition.svg",
      alt: "Abstract illustration of a football changing hands above the Seattle skyline and stadium arches",
      width: 1200,
      height: 675
    },
    featured: true,
    status: "published"
  },
  {
    slug: "welcome-to-the-seahawks-fan-zone-newsroom",
    headline: "Welcome to the Seahawks Fan Zone newsroom",
    dek: "A new home for original Seahawks reporting, roster context, game-week analysis and accountable sourcing.",
    publishedAt: "2026-08-28",
    updatedAt: "2026-08-28",
    author: "Seahawks Fan Zone Editorial Team",
    category: "News",
    tags: ["Newsroom", "Editorial standards", "The 12s"],
    season: 2026,
    opponent: null,
    body: [
      "Seahawks Fan Zone is expanding beyond schedules and stat tables. This newsroom is built to connect the news of the day to the questions Seattle fans ask next: what a move means for the depth chart, where a performance fits statistically and how a result changes the road ahead.",
      "Every story here will be dated, attributed and written in original language. When reporting begins with information from another outlet or an official announcement, the story will link to that source and clearly separate reported facts from our analysis.",
      "The goal is useful context, not volume for its own sake. Roster stories should explain role and competition. Game-week coverage should connect opponent tendencies to Seattle's personnel. Analysis should show its work and avoid presenting a hunch as a fact.",
      "Readers can browse by category, search the archive or subscribe to the RSS feed. Empty desks will stay visible as a promise of coverage, but they will not be indexed as thin pages until they contain published work.",
    ],
    sources: [
      { label: "Seahawks Fan Zone methodology", url: "/methodology" },
      { label: "Corrections and feedback", url: "/sources" },
    ],
    hero: sharedHero,
    featured: true,
    status: "published",
  },
  {
    slug: "how-we-add-context-to-seahawks-roster-moves",
    headline: "How we will evaluate Seahawks roster moves",
    dek: "The transaction is only the beginning: role, replacement value, cap timing and schedule fit turn a move into a useful story.",
    publishedAt: "2026-08-28",
    updatedAt: "2026-08-28",
    author: "Seahawks Fan Zone Editorial Team",
    category: "Roster",
    tags: ["Roster", "Depth chart", "Analysis"],
    season: 2026,
    opponent: null,
    body: [
      "A name entering or leaving the roster is a fact. Its football meaning depends on much more: the snaps available at that position, the skills already represented in the room and the alternatives Seattle can use on game day.",
      "Our roster coverage will start with the player's likely role. We will look at recent participation and production when reliable data is available, while noting that raw totals can reflect opportunity as much as performance. A reserve who plays special teams may affect the active roster differently from a specialist signed for a narrow package.",
      "Timing matters, too. A preseason move can be about evaluation or injury coverage; an in-season move can answer an immediate matchup problem. We will connect those decisions to the schedule without claiming certainty about plans the team has not announced.",
      "That approach also means being comfortable with an incomplete answer. If contract terms, injury details or a corresponding move are not public, the story will say so and update only when new information materially changes the picture.",
    ],
    sources: [
      { label: "Seahawks Fan Zone player directory", url: "/players" },
      { label: "Seahawks Fan Zone methodology", url: "/methodology" },
    ],
    hero: sharedHero,
    featured: false,
    status: "published",
  },
  {
    slug: "a-better-way-to-read-seahawks-game-week",
    headline: "A better way to read Seahawks game week",
    dek: "Opponent, availability, recent form and schedule pressure belong in the same preview—not in isolated boxes.",
    publishedAt: "2026-08-28",
    updatedAt: "2026-08-28",
    author: "Seahawks Fan Zone Editorial Team",
    category: "Game Week",
    tags: ["Game Week", "Schedule", "Matchups"],
    season: 2026,
    opponent: null,
    body: [
      "Game-week coverage works best when it narrows a full week of information into a few questions that can decide Sunday. That requires more than repeating records or listing injury designations.",
      "Our previews will identify the matchup behind the matchup. That may be protection against a pressure front, tackling against yards after contact or Seattle's ability to create favorable down-and-distance situations. The specific question will change with the opponent and available personnel.",
      "We will use recent statistics as context rather than prediction. A small sample can describe what happened without proving what will happen next. When personnel, opponent strength or game state changes the meaning of a number, the preview should explain that limitation.",
      "Finally, each preview will place the game on the schedule. Travel, rest and the NFC West race can change the stakes, but they do not predetermine the result. The aim is to help the 12s watch with a sharper lens and return afterward to see which questions actually mattered.",
    ],
    sources: [
      { label: "Seahawks Fan Zone schedule", url: "/schedule" },
      { label: "Seahawks Fan Zone standings", url: "/standings" },
    ],
    hero: sharedHero,
    featured: false,
    status: "published",
  },
];

const validDate = (value: string) => Number.isFinite(new Date(value).getTime());
const slugs = new Set<string>();
for (const article of articles) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) || slugs.has(article.slug)) throw new Error(`Invalid or duplicate news slug: ${article.slug}`);
  if (!NEWS_CATEGORIES.includes(article.category) || !validDate(article.publishedAt) || !validDate(article.updatedAt)) throw new Error(`Invalid news metadata: ${article.slug}`);
  if (new Date(article.updatedAt) < new Date(article.publishedAt)) throw new Error(`updatedAt precedes publishedAt: ${article.slug}`);
  slugs.add(article.slug);
}

export const publishedArticles = articles
  .filter((article) => article.status === "published")
  .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

export const NEWS_PAGE_SIZE = 6;
export const categorySlug = (category: NewsCategory) => category.toLowerCase().replaceAll(" ", "-");
export const formatArticleDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
export const materiallyUpdated = (article: NewsArticle) => new Date(article.updatedAt).getTime() - new Date(article.publishedAt).getTime() >= 60 * 60 * 1000;
