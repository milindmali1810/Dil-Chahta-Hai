import { afterEach, describe, expect, it } from "vitest";
import { formatInr, formatTimeIst } from "./format";

describe("formatInr", () => {
  it("uses Indian digit grouping", () => {
    expect(formatInr(0)).toBe("₹0");
    expect(formatInr(999)).toBe("₹999");
    expect(formatInr(1000)).toBe("₹1,000");
    expect(formatInr(12000)).toBe("₹12,000");
    expect(formatInr(100000)).toBe("₹1,00,000");
    expect(formatInr(1234567)).toBe("₹12,34,567");
    expect(formatInr(123456789)).toBe("₹12,34,56,789");
  });

  it("matches en-IN locale formatting", () => {
    for (const n of [5, 45000, 250000, 9876543]) {
      expect(formatInr(n)).toBe(`₹${n.toLocaleString("en-IN")}`);
    }
  });
});

describe("formatTimeIst", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("formats in IST whatever the machine timezone", () => {
    // 16:12 UTC = 21:42 IST.
    const at = new Date("2026-09-30T16:12:00Z");
    for (const tz of ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      expect(formatTimeIst(at)).toBe("9:42 PM");
    }
  });

  it("accepts ISO strings with any offset", () => {
    expect(formatTimeIst("2026-09-30T21:42:00+05:30")).toBe("9:42 PM");
    expect(formatTimeIst("2026-09-30T18:30:00Z")).toBe("12:00 AM");
    expect(formatTimeIst("2026-09-30T06:30:00Z")).toBe("12:00 PM");
    expect(formatTimeIst("2026-09-30T03:35:00Z")).toBe("9:05 AM");
  });
});
