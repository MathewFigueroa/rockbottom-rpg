# Acts 2–3: a playable path through The Second Copy

Stack order: foundation PR #1, PostgreSQL PR #2, then this campaign expansion. None is merged automatically.

## Delivered campaign

Seven versioned quest chains contain 21 irreversible stages. The server chooses the current stage from persisted progress, checks path and quest prerequisites, validates cash/income and options, applies bounded effects once, and records the realized choice. Client-provided scores, risk, seed, rewards or stage numbers are ignored. This is a typed authored quest interpreter, not arbitrary pack-expression evaluation.

| Chain | Playable decisions and consequences |
| --- | --- |
| Regulars | First corner, wallet return/theft, then courier or shop-closing work; earnings, fatigue, income reliability and Nell/Sam trust |
| The Flip | Pay for inspection, disclose/conceal the radio fault, return/fence the bracelet; earned provenance, money, trust and legal record |
| The Score | Review terms and answer three compact aptitude questions; the server computes E-1 through E-4 entry rank |
| First Rotation | Squad training, 10/20/28% support allotment, decline/ridge/wash decision, complete/edited debrief; net pay, transfers, absence and Vale trust |
| Keys | Deposit and income checks for SRO housing; prepare the room or qualify/pay for two bedrooms |
| Day Thirty | Honest preparation and the actual shared five-factor court calculation, recorded separately from the public inquiry |
| The Frame | Adult-child viewpoint, uncertainty/documentary interpretation, then call home or close the box; memory does not rewrite prior actions |

The original pack names and premises inform these selected chains, but their scripts are not a claim that every existing pack stage is now executed. The Score is explicitly a three-question compact assessment, not the full timed twelve-question battery. First Rotation combines selected training/allotment/rotation ideas into one three-day offer; periodic pay, full service terms, combat skills and recurring deployment schedules remain future work.

## Risk, authority and persistence

A deployment displays a squad-adjusted 2% fatal risk for the ridge and 8% for the wash. Neither button enables until the user explicitly checks permanent-death consent; agents must submit `confirmPermanentDeath: true`. A server-private random seed is created with the character (or lazily migrated for old saves). SHA-256 of that seed, character ID and the unique route stage produces the fixed roll. The seed is never included in agent, owner or spectator state. The roll and probability are published only with the result. The stage cannot be repeated and the seed survives file/database restoration. This is an auditable deterministic draw, not a cryptographic fairness commitment or protection against restoring an older backup.

Rank sets gross triple pay; the chosen percentage leaves first as child support, net pay enters cash, and deployment reduces attendance. Declining has no casualty roll and takes only a short paperwork window. Death permanently closes parent-world actions; only the adult-child archive quest remains. The simulation never resurrects the parent while processing that archive.

All quests use the same action timer and command API in manual and agent mode. `get_story_state` now returns unlocked quest contracts, blocked-option reasons, progress, trust, flags, support totals and realized events. The browser refreshes its owner snapshot after actions; Story and Quests tabs work on desktop and mobile. Spectators receive realized quest events in the existing live action feed, without private random state or plan notes. The compact observe endpoint lists the quest tool contract; full narrative context stays in get_story_state. Nearby entities in compact observation are capped at the three newest arrivals to stay within the existing 2KB budget; general proximity discovery remains future work.

## Expanded original story

The ledger can no longer be authenticated by simply selecting a path. Street play must earn provenance through Regulars and The Flip; Army play must finish assessment and rotation/debrief. Returning the bracelet gives Sam an independent witness. Fencing it causes him to withhold his certainty, requiring Nell’s tenant records. An edited Army debrief leaves a missing page that Dominguez must supply herself.

At the witness scene, the player may listen, challenge Dana’s concealment, or challenge Vale’s authorization. Dana’s mistake does not grant permission to identify her resident. Vale’s correction establishes that the contractor received the warning before the gate opened: negligence and deliberate falsification are different failures, and neither erases the player’s recovery work.

Two new aftermath scenes bring the story to eight interwoven record scenes. Tuesday’s visit conflicts with an audit briefing. Attending the briefing discovers another condemned block but creates a real absence in family court; keeping the visit leaves Nell to read the statement. Both results remain true. The next scene asks whether to release a redacted public copy or keep the record within the legal process. It cannot magically unpublish addresses exposed by an earlier decision.

The family-court order uses housing, income, record, sobriety and visits, then the adult child enters the archive. The frame echoes the bracelet receipt, allotment, deployment refusal/acceptance, rescue register and Sam’s injury receipt. Outcomes are earned: HONOR follows deployment death; FORGIVENESS requires a recorded shared-custody order; THE CYCLE recognizes the wallet-plus-bracelet pattern when shared custody was not achieved; THE OPEN DOOR leaves an unfinished recovery meaningful. The final call/closed-box choice concerns the adult child’s present, not a reward that absolves the parent.

Timeline labels describe the authored record’s chronology, distinct from the live shard clock. They do not impose calendar deadlines on agents. This preserves the nonlinear reconstruction while action duration remains server-enforced.

## Save compatibility and remaining milestones

Older six-scene saves continue at the two new aftermath decisions. Existing path, rescue and disclosure choices and rewards are preserved. Absent campaign state initializes without resetting a character. Old characters acquire a private random seed only when needed. Completed quest stages remain non-repeatable after reload. No database schema migration beyond PR #2 is needed because this state is inside the versioned snapshot.

Next slices: reusable JSON pack compilation with deep reference/reachability validation; the full aptitude/training minigames; recurring service pay and discharge; squad member casualties and bonds; inventory-backed pawn markets and scheduled courier demand; crew stash/rat evidence; HPD warrants, jail/bail and relapse systems; fuller relationship repair quests; localization and authored map movement. Current quest outcomes resolve at command time and gate the next action for their duration, matching the existing simulation; scheduled completion events are still a separate reliability/gameplay milestone. Rent is a one-time housing progression charge here, not a recurring housing economy.

Tests cover all eight original path/rescue/disclosure combinations with the new prerequisites, four full route/Tuesday/court/frame runs, fatal and surviving deterministic deployment outcomes, consent, client-parameter tampering, no replay, affordability without partial mutation, sleep after housing upgrades, private-seed persistence and old-save continuation. Browser coverage follows the complete Army-decline chain into the actual hearing and frame, plus mobile risk/consent controls.
