import type { CharacterState, LifeView } from '@rockbottom/shared';
import type { MemoryStore } from './store.js';
import { socialView } from "./social.js";
import { armyView } from './army.js';
import { streetView } from './streets.js';
export function lifeView(c: CharacterState, store: MemoryStore, now: number): LifeView {
  const army = armyView(c, now); const street = streetView(c, store, now);
  const social = socialView(c, store, now);
  return { title: street.commands.length ? street.title : army.title, summary: [...army.summary, ...street.summary, ...social.summary], commands: [...army.commands, ...street.commands, ...social.commands] };
}
