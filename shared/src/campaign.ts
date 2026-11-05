export interface QuestOption {
  id: string; text: string; detail: string;
  cash?: number; grit?: number; heat?: number; energy?: number; income?: number; record?: number;
  trust?: { person: 'sam' | 'dana' | 'nell' | 'vale'; delta: number };
  flag?: string; minimumCash?: number; minimumIncome?: number; lethalRisk?: number;
}
export interface QuestStage { id: string; objective: string; minutes: number; options: readonly QuestOption[] }
export interface QuestDefinition { id: string; title: string; path?: 'street' | 'army'; after?: string; stages: readonly QuestStage[] }
export interface CampaignState {
  version: 1; progress: Record<string, number>; flags: string[];
  trust: { sam: number; dana: number; nell: number; vale: number };
  aptitude: number; rank: 'E-1' | 'E-2' | 'E-3' | 'E-4'; allotment: number; supportPaid: number;
  perspective: 'parent' | 'adult-child'; ending?: string;
  events: Array<{ sequence: number; at: string; quest: string; stage: string; choice: string; text: string; risk?: number; roll?: number }>;
}
export const CAMPAIGN_QUESTS: readonly QuestDefinition[] = [
  { id: 'regulars', title: 'Regulars · a name on Market Row', path: 'street', stages: [
    { id: 'first-corner', objective: 'Mara asks you to play outside the boarded pharmacy, leaving the doorway clear. No introductions on credit.', minutes: 60, options: [
      { id: 'play', text: 'Play the first corner', detail: 'A shopkeeper folds sixteen dollars into the request slip. Nell learns your name.', cash: 16, energy: -6, trust: { person: 'nell', delta: 2 } } ] },
    { id: 'rain-route', objective: 'The second corner is a lunch delivery. A wallet slips from an order bag: forty-six dollars and a bus pass.', minutes: 45, options: [
      { id: 'return-wallet', text: 'Return the wallet unopened', detail: 'Its owner needs the bus pass more than the cash. Mara offers you a regular route.', grit: 12, trust: { person: 'nell', delta: 10 }, flag: 'wallet-returned' },
      { id: 'keep-wallet', text: 'Keep $46; leave the bus pass', detail: 'The route pays today. Tomorrow the owner asks Mara why the bag was open.', cash: 46, heat: 4, trust: { person: 'nell', delta: -8 }, flag: 'wallet-kept' } ] },
    { id: 'regular-face', objective: 'For the third corner, choose a shift that someone can count on.', minutes: 120, options: [
      { id: 'courier', text: 'Take the rain courier route', detail: 'Nell writes your name on next week’s rota. Reliability has an address now.', cash: 28, energy: -12, income: 12, flag: 'courier-route' },
      { id: 'close-shops', text: 'Help close the shops', detail: 'Sam gives you the shutters key and asks you to bring it back tomorrow.', cash: 22, energy: -8, income: 12, trust: { person: 'sam', delta: 4 } } ] },
  ] },
  { id: 'the-flip', title: 'The Flip · what a thing costs', path: 'street', after: 'regulars', stages: [
    { id: 'inspection', objective: 'Sam’s radio costs eight dollars in parts. The fault appears only after it warms up. Inspect before you price it.', minutes: 60, options: [
      { id: 'inspect', text: 'Buy parts and test the radio · $8', detail: 'The signal dies on the seventh minute. You mark the time rather than shake the case.', cash: -8, minimumCash: 8, energy: -4 } ] },
    { id: 'fault', objective: 'A buyer wants the radio for a hospital room. It will work until the casing heats. Name the fault or sell the silence.', minutes: 30, options: [
      { id: 'disclose', text: 'Write the fault on the tag', detail: 'The buyer pays eighteen and thanks you for leaving them a choice.', cash: 18, trust: { person: 'sam', delta: 12 }, flag: 'fault-disclosed' },
      { id: 'hide', text: 'Sell before it warms up', detail: 'Thirty dollars. Sam takes your receipt from the till and reads it twice.', cash: 30, trust: { person: 'sam', delta: -12 }, flag: 'fault-hidden' } ] },
    { id: 'heirloom', objective: 'An engraved bracelet matches a burglary notice. The family can identify it; a fence offers $220 without questions.', minutes: 60, options: [
      { id: 'return', text: 'Return the engraved bracelet', detail: 'Sam calls the family. The woman who arrives recognizes an address on the evacuation list.', grit: 30, record: -1, income: 8, trust: { person: 'sam', delta: 10 }, flag: 'heirloom-returned' },
      { id: 'fence', text: 'Fence it outside Sam’s shop', detail: 'The initials come off. A camera keeps the exchange. The money is real; so is the record.', cash: 220, heat: 18, record: 1, trust: { person: 'sam', delta: -15 }, flag: 'heirloom-fenced' } ] },
  ] },
  { id: 'the-score', title: 'The Score · sign with open eyes', path: 'army', stages: [
    { id: 'terms', objective: 'Vale explains the compact aptitude assessment, regular pay and service allotment. This inquiry logistics placement is not a promise of custody.', minutes: 30, options: [
      { id: 'review', text: 'Read the terms with Dana', detail: 'Dana underlines the sentence about absence. A steady transfer cannot attend a visit.', trust: { person: 'dana', delta: 4 } } ] },
    { id: 'arithmetic', objective: 'Three sealed water crates contain twelve bottles each. Six bottles are reserved for the clinic. How many remain?', minutes: 1, options: [
      { id: '30', text: '30 bottles', detail: 'The clerk checks the arithmetic without looking at your address.', flag: 'aptitude-correct' },
      { id: '42', text: '42 bottles', detail: 'The clerk explains that a reservation subtracts from what can be carried.' } ] },
    { id: 'mechanical', objective: 'A load shifts toward the rear axle. Before moving the truck, what do you do?', minutes: 1, options: [
      { id: 'rebalance', text: 'Stop and rebalance the load', detail: 'Vale marks the answer. “Stopping is a skill they forget to put on the poster.”', flag: 'aptitude-correct' },
      { id: 'accelerate', text: 'Accelerate to settle the load', detail: 'Vale explains why momentum is not a tie-down.' } ] },
    { id: 'communications', objective: 'An evacuation order has no timestamp. Two versions disagree. What can you verify first?', minutes: 1, options: [
      { id: 'source', text: 'Request the source and timestamp', detail: 'Your starting pay band is recorded from the three answers. No self-reported score is accepted.', flag: 'aptitude-correct' },
      { id: 'loudest', text: 'Use the most urgent version', detail: 'Urgency tells you somebody is afraid. It does not establish the order of events.' } ] },
  ] },
  { id: 'first-rotation', title: 'First Rotation · the people in the truck', path: 'army', after: 'the-score', stages: [
    { id: 'training', objective: 'The training load includes a crate nobody can lift alone. Petty asks whether you want the clock or the whole squad to finish.', minutes: 1440, options: [
      { id: 'together', text: 'Carry it together', detail: 'Dominguez waits without making a speech. The slowest person comes in with the crate.', grit: 12, trust: { person: 'vale', delta: 6 }, flag: 'squad-trained' } ] },
    { id: 'allotment', objective: 'Finance offers an automatic child-support allotment of 10%, 20% or 28%. Net pay is calculated after the transfer.', minutes: 30, options: [
      { id: '10', text: 'Set 10% support', detail: 'A tenth leaves first. The rest is yours to budget.' },
      { id: '20', text: 'Set 20% support', detail: 'A fifth leaves first. You keep a copy of the standing instruction.' },
      { id: '28', text: 'Lock 28% for this placement', detail: 'Twenty-eight percent leaves before you can improvise. This placement’s allotment cannot be changed.', flag: 'allotment-locked' } ] },
    { id: 'route', objective: 'A three-day supply rotation offers triple base pay. Squad-adjusted fatal casualty risk: ridge 2%, washed road 8%. Declining keeps you home. Accepting requires explicit permanent-death confirmation.', minutes: 4320, options: [
      { id: 'decline', text: 'Decline and stay for the visit', detail: 'Vale files the refusal. Your name stays on the home docket.', grit: -5, flag: 'deployment-declined' },
      { id: 'ridge', text: 'Deploy with the squad · 2% fatal risk', detail: 'The ridge costs a day. The truck carries its water to the last checkpoint.', lethalRisk: 0.02, flag: 'deployment-accepted' },
      { id: 'wash', text: 'Take the washed road · 8% fatal risk', detail: 'The shortcut saves time for the clinic. The wash takes away the margin.', lethalRisk: 0.08, flag: 'deployment-accepted' } ] },
    { id: 'debrief', objective: 'Vale asks who authorized the route. A missing timestamp resembles the evacuation paperwork. Give her the complete record or protect the unit’s reputation.', minutes: 60, options: [
      { id: 'complete-record', text: 'File the complete route log', detail: 'Vale signs the correction under her own name. The annex archive opens to your inquiry.', trust: { person: 'vale', delta: 12 }, income: 30, flag: 'route-log-open' },
      { id: 'clean-record', text: 'File only the delivery receipt', detail: 'The unit gets a clean report. Vale asks what the report is for if nobody is allowed to learn from it.', trust: { person: 'vale', delta: -10 }, income: 20, flag: 'route-log-sealed' } ] },
  ] },
  { id: 'keys', title: 'Keys · a room that can be inspected', stages: [
    { id: 'lease', objective: 'Dana has an SRO vacancy. The deposit is $180 and requires income consistency of 50. A room is a foothold, not a verdict.', minutes: 60, options: [
      { id: 'sro', text: 'Sign the SRO lease · $180', detail: 'One key, one sink, a window that closes. You can write an address without borrowing one.', cash: -180, minimumCash: 180, minimumIncome: 50, flag: 'housing-sro' } ] },
    { id: 'inspection', objective: 'Prepare the room for inspection, or use $400 and income consistency of 75 to move into a two-bedroom. Custody still weighs every factor.', minutes: 120, options: [
      { id: 'prepare', text: 'Prepare the SRO for inspection', detail: 'The inspector records what is there. Dana brings a second mug, without calling it a milestone.', grit: 6 },
      { id: 'two-bedroom', text: 'Lease two bedrooms · $400', detail: 'The second toothbrush is still in its wrapper. You do not put a name on the door until you ask.', cash: -400, minimumCash: 400, minimumIncome: 75, flag: 'housing-two-bedroom' } ] },
  ] },
  { id: 'day-thirty', title: 'Day Thirty · care on the record', after: 'keys', stages: [
    { id: 'prepare', objective: 'The inquiry has ended. Family court will hear housing, income, record, sobriety and attendance. Dana asks you to distinguish a hope from a promise.', minutes: 30, options: [
      { id: 'honest', text: 'Say what you can sustain', detail: '“Tuesday. I can promise Tuesday.” Dana writes it down without improving the sentence.', flag: 'custody-honest', trust: { person: 'dana', delta: 8 } },
      { id: 'defend', text: 'Explain what the city cost you', detail: 'The judge accepts the account of the collapse, then asks who will be there after school.' } ] },
    { id: 'order', objective: 'Hear the actual five-factor custody score. Civic heroism does not replace sustained care.', minutes: 90, options: [
      { id: 'hear-order', text: 'Hear the family-court order', detail: 'The clerk reads the factors separately. The inquiry and this order share a building, not a standard of proof.', flag: 'custody-heard' } ] },
  ] },
  { id: 'the-frame', title: 'The Frame · the child’s side of the table', stages: [
    { id: 'hard-cut', objective: 'Years later, the adult child opens the archive. The city is on a laptop. The decisions remain in the record; this viewpoint cannot change them.', minutes: 1, options: [
      { id: 'open-box', text: 'Open the evidence box', detail: 'Sam sits across the kitchen table, older now. “I gave you dates. Your program gave them edges.”' } ] },
    { id: 'uncertainty', objective: 'Two records repeat the same signature. Agreement may be corroboration or a copied mistake. How will you label the uncertain scenes?', minutes: 1, options: [
      { id: 'mark-uncertain', text: 'Mark uncertain scenes honestly', detail: 'You write “uncertain” without writing “meaningless.” The rescue, the money and the missed visit keep their separate weight.', flag: 'belief-open' },
      { id: 'documentary', text: 'Keep only the documented claims', detail: 'A cleared allotment proves a transfer. A signed visit proves attendance. Neither can tell you what someone hoped.', flag: 'belief-documentary' } ] },
    { id: 'ending', objective: 'The final page is yours. The parent’s consequences are already fixed. What happens next is not evidence yet.', minutes: 1, options: [
      { id: 'call-home', text: 'Call home', detail: 'Someone answers with your name. You let the silence be ordinary.', flag: 'child-called-home' },
      { id: 'close-box', text: 'Close the box for tonight', detail: 'The photograph stays on your side of the table. Leaving the record unfinished does not require leaving your life.', flag: 'child-closed-box' } ] },
  ] },
];
