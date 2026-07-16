export interface PremiumGate {
  canJoinHostedShard(accountId: string): Promise<boolean>;
  maxConcurrentAgents(accountId: string): Promise<number>;
  maxSpectators(accountId: string): Promise<number>;
  hasCosmeticPack(accountId: string, packId: string): Promise<boolean>;
}

/**
 * Stripe-ready seam. Self-hosters get every non-cosmetic capability for free.
 * The official service can replace this implementation without touching sim code.
 */
export class EnvironmentPremiumGate implements PremiumGate {
  private free = process.env.PREMIUM_ALL_FREE !== "false";
  async canJoinHostedShard() { return this.free; }
  async maxConcurrentAgents() { return this.free ? 64 : 1; }
  async maxSpectators() { return this.free ? 64 : 5; }
  async hasCosmeticPack() { return this.free; }
}
