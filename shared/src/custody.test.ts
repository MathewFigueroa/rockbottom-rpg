import { describe, expect, it } from "vitest";
import { calculateCustody } from "./index";

describe("custody hearing factors", () => {
  it("improves when housing and sobriety improve", () => {
    const floor = calculateCustody({ housing: "underpass", incomeConsistency: 30, record: 2, sobrietyDays: 5, visitationAttendance: 50 });
    const stable = calculateCustody({ housing: "two-bedroom", incomeConsistency: 90, record: 0, sobrietyDays: 90, visitationAttendance: 100 });
    expect(stable.score).toBeGreaterThan(floor.score + 50);
    expect(stable.level).toBe("shared");
  });

  it("makes a criminal record materially affect the order", () => {
    const clean = calculateCustody({ housing: "studio", incomeConsistency: 80, record: 0, sobrietyDays: 60, visitationAttendance: 100 });
    const record = calculateCustody({ housing: "studio", incomeConsistency: 80, record: 9, sobrietyDays: 60, visitationAttendance: 100 });
    expect(clean.score - record.score).toBeGreaterThanOrEqual(17);
    expect(clean.level).not.toBe(record.level);
  });
});
