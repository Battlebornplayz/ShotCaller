/**
 * ShotCaller's learn-to-play text for Skillshot City, written from the research in
 * `reports/Skillshot City game knowledge.md`. Checked against game version 1992 (hotfix 23, 2026-10-31).
 * Balance moves almost weekly, so this keeps to the shape of the game and avoids exact skill numbers.
 * Default keys differ between sources and players can rebind them, so don't name keys here.
 */

export const LEARN_VERSION = 'game version 1992, November 2026';

export const THE_LOOP: string[] = [
  'Only round 3 decides the winner. Rounds 1 and 2 exist to make you strong.',
  'Farm XP and cash from missions, blue XP Pools and safe kills.',
  'Buy a better gun every round.',
  'Get 3 kills each round to earn a syringe, and spend it on your best skill.',
  'Be alive when the round 3 showdown starts.',
];

export const FIRST_MATCHES: { title: string; text: string }[] = [
  { title: 'Start at round 1', text: 'Use the cog above PLAY so you start at round 1 instead of joining a match halfway through.' },
  { title: 'Don’t read every menu yet', text: 'The community’s beginner guide says to play 5 to 10 matches first, and the developer agrees most menus can wait.' },
  { title: 'Learn one skill at a time', text: 'Try each skill you’re offered and open it in Lookup. Knowing what your skills do beats any tier list.' },
  { title: 'Don’t trust early wins', text: 'Early games are on newbie servers, and the developer aims for about half of players to be bots. Your results will drop when real players arrive. That’s normal.' },
  { title: 'Steal good builds', text: 'On the final scoreboard, hover the icon next to a player’s name to see their build.' },
  { title: 'Skip the old F10 guide', text: 'Only its Game Overview tab is reliably current. The other tabs describe systems that have since been removed.' },
];

export const ROUNDS: { title: string; goal: string; steps: string[] }[] = [
  {
    title: 'Round 1',
    goal: 'Get a real gun, do missions, earn a syringe.',
    steps: [
      'Grab a gun from a crate quickly. Almost anything beats the starter gun.',
      'Go to a mission giver: a green arrow, and a civilian with a green speech bubble.',
      'Stand in blue XP Pools between tasks.',
      'Get 3 kills for a syringe. Don’t chase enemies with a short-range gun.',
    ],
  },
  {
    title: 'Round 2',
    goal: 'Buy a tier 2 gun and keep farming safely.',
    steps: [
      'Save $5,000 and buy a tier 2 gun from a vendor.',
      'Gangster camps pay well, but they have 5 guards. Only clear them with a gun that outranges them, and stay above half health in case someone follows you in.',
      'Letting others fight and then finishing the winner works, but the winner gets XP and shield pickups heal, so don’t wait too long.',
    ],
  },
  {
    title: 'Round 3',
    goal: 'Prepare for a fight you can’t avoid.',
    steps: [
      'Save $15,000 and buy a tier 3 gun.',
      'Stock up on grenades. They’re great for breaking cover.',
      'If you have a chemical, place it near where the showdown will happen, before it starts.',
      'Be alive when the timer hits 0:00.',
    ],
  },
  {
    title: 'Showdown',
    goal: 'Hunt from a safe spot. This is where points come from.',
    steps: [
      'Showdown starts 3 minutes into each round. Your score comes only from wins and showdown kills: +1 per survivor you kill in showdown, +5 for winning round 1 or 2, and +100 for winning round 3. Your level gives no points.',
      'For the first 2 minutes of it, dying is recoverable. Take good fights against survivors.',
      'After that, death is final and the circle shrinks harder. Be pickier about fights and stay near the edge of the circle.',
      'Missed the final survivors in rounds 1 or 2? No problem. Keep looting to level up for the next round.',
    ],
  },
];

export const IF_YOU_DIE: string[] = [
  'You become a zombie and lose some XP. It’s a small amount, about what one player kill gives.',
  'Collect 4 heart pieces to revive. Follow the pink arrow to heart crates, which land every 30 seconds until 2 minutes into showdown.',
  'You come back at half health and shield. Zombies can’t buy anything.',
  'The real cost of dying is losing your kill streak, some Survivor Income and your position, so don’t panic, but don’t throw your life away either.',
];

export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: 'Draft', meaning: 'The choice of 2 skills you get as you level up. You get 5 skills per match, and the other level-ups improve skills you already have.' },
  { term: 'Reroll', meaning: 'Swaps the offered skills for new ones. You only get a few, so save them for when both offers are bad.' },
  { term: 'Synergy', meaning: 'Two things that work well together. The game lists 80 official pairs, either two skills or a class plus a skill. Each comes with a tip, and each has a challenge that pays Acid.' },
  { term: 'Syringe', meaning: 'Earned with 3 kills in a round. Spend it on a skill in the draft screen to add 2 levels and unlock its mutation.' },
  { term: 'Mutation', meaning: 'A skill’s second ability, unlocked with a syringe. Lookup shows each one.' },
  { term: 'Rarity', meaning: 'How far you’ve upgraded a skill on your account: Common, Rare, Epic or Legendary. It sets the highest level the skill can reach (4, 5, 6 or 7) and how strong its mutation is. The last two levels add the most power.' },
  { term: 'Flasks, Acid and DNA', meaning: 'How you raise rarity. Flasks and Acid give skills DNA, and enough DNA moves a skill up a rarity. Dailies and ranked pay Acid.' },
  { term: 'Uranium', meaning: 'The shop currency, earned from challenges and ranked.' },
  { term: 'XP Pool', meaning: 'A blue area on the map. Stand in it to gain XP. Each one runs out.' },
  { term: 'Vendor', meaning: 'A shop on the map selling guns, ammo, grenades, chemicals and upgrades. Each upgrade you buy costs more than the last.' },
  { term: 'Gun tiers', meaning: 'Tier 1 costs up to $1,000, tier 2 costs $5,000 from round 2, and tier 3 costs $15,000 from round 3. Marksman gets them a round earlier.' },
  { term: 'Chemical', meaning: 'An item you can place on the ground for an effect, and that also gives a bonus while you carry it. Enemies can’t see one until they stand in it.' },
  { term: 'Showdown', meaning: 'The last stretch of each round, where the circle closes in and kills against survivors earn score. Patch notes call it overtime.' },
  { term: 'Zombie', meaning: 'What you become when a survivor is killed. Enemy survivors show in red. Zombies need 4 hearts to revive.' },
  { term: 'Wanted level', meaning: 'Up to 5 stars of police attention. It rises as you fight cops, a helicopter arrives at 5 stars, and dying clears it. You can pay it off at a vendor.' },
  { term: 'Survivor Income', meaning: 'Cash and XP that build up while you stay alive and pay out on your next kill. Dying costs you part of it.' },
  { term: 'Round modifiers', meaning: 'Rules for the next round chosen by a vote. The round winner’s vote counts most. Vote for ones that help your class or build.' },
  { term: 'Score and trophies', meaning: '+1 per survivor killed in showdown, +5 per win in round 1 or 2, +100 for winning round 3. Trophies come from your placement and score, and they drive your rank and account XP.' },
  { term: 'Ranked', meaning: 'Unlocks at account level 30. Your rating is a slow average of your trophies, so one bad match barely matters.' },
];

/** How the game says offers are built. Weights are unknown; the level of each step isn't confirmed. */
export const DRAFT_STEPS: { step: string; left: string; right: string }[] = [
  { step: 'Skills 1 and 2', left: 'Random', right: 'Random' },
  { step: 'Upgrade', left: 'One of your skills', right: 'One of your skills' },
  { step: 'Skill 3', left: 'Random', right: 'A Legendary from the top of your build (random if that slot is empty)' },
  { step: 'Skill 4', left: 'Random', right: 'A random skill from your build' },
  { step: 'Upgrades', left: 'One of your skills', right: 'One of your skills, higher level' },
  { step: 'Skill 5', left: 'Random', right: 'Random' },
];

export const CLASS_NOTES: Record<string, { fit: string; note: string }> = {
  ASSAULT: { fit: 'Best to start', note: 'Heals itself from enemy kills, with no extra buttons to learn.' },
  STRIKER: { fit: 'Medium', note: 'Most popular, but needs good aim and has no healing. It has the lowest average trophies.' },
  HEAVY: { fit: 'Good', note: 'Tough and simple, but the developer changes it often.' },
  CASTER: { fit: 'Harder', note: 'Best win rate, but you have to keep casting skills well.' },
  SCAVENGER: { fit: 'Medium', note: 'Doubles loot, so it rewards farming.' },
  CRIMINAL: { fit: 'Medium', note: 'Comes with a gang, but cops pile up fast.' },
  SCIENTIST: { fit: 'Harder', note: 'Needs chemical knowledge and unlocks later.' },
  ASSASSIN: { fit: 'Harder', note: 'Depends on timing its damage window, and unlocks last.' },
};

export const GUNS: { round: string; picks: { name: string; why: string }[] }[] = [
  {
    round: 'Round 1 (up to $1,000)',
    picks: [
      { name: 'AK47', why: 'Most used, and accurate at range' },
      { name: 'Uzi', why: 'Highest steady damage for the price' },
      { name: 'M249', why: 'High damage, but it spreads' },
    ],
  },
  {
    round: 'Round 2 ($5,000)',
    picks: [
      { name: 'M60', why: 'About the damage of a tier 3 gun, and it spreads' },
      { name: 'MP5', why: 'Round 2 staple, short range' },
      { name: 'Barrett', why: 'Very long range, needs aim' },
    ],
  },
  {
    round: 'Round 3 ($15,000)',
    picks: [
      { name: 'Minigun', why: 'Highest steady damage' },
      { name: 'Flamethrower', why: 'Best results of any gun' },
      { name: 'Seek Rifle', why: 'Bullets home in, so it forgives shaky aim' },
      { name: 'Photon Beam', why: 'Very long range' },
    ],
  },
];

export const GUNS_TO_AVOID = 'M3, SPAS-12 and Blast Cannon have the weakest results, even though shotguns feel strong when they hit you.';

export const SOURCES_NOTE =
  'From the game’s own text and patch notes, Steam community guides, and public stats on skillshotcity.gg (a community site, not official). Numbers change often, so treat them as a guide.';
