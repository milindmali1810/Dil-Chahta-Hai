import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Part 1: guard coverage (eng review R4, A1). Reads app/actions.ts as TEXT and parses it
// with the TypeScript compiler, so comments, strings and formatting can't fool it.
// ---------------------------------------------------------------------------

const PUBLIC_ACTIONS = ["createTrip", "enterPin"];
const GUARDS = ["requireParticipant", "requireOrganiser"];

const SOURCE_PATH = fileURLToPath(new URL("./actions.ts", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf8");
const file = ts.createSourceFile("actions.ts", source, ts.ScriptTarget.Latest, true);

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind)
  );
}

/** Every top-level statement that exports something, with a readable description. */
function exportedStatements(): { node: ts.Statement; text: string }[] {
  return file.statements
    .filter(
      (s) =>
        ts.isExportDeclaration(s) ||
        ts.isExportAssignment(s) ||
        hasModifier(s, ts.SyntaxKind.ExportKeyword),
    )
    .map((node) => ({ node, text: node.getText(file).split("\n")[0] }));
}

const exportedFunctions = file.statements.filter(
  (s): s is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(s) && hasModifier(s, ts.SyntaxKind.ExportKeyword),
);

/**
 * Is `stmt` exactly `const access = await requireX(...)`, optionally followed by
 * `.catch(guardError)` (which turns a thrown guard into a refusal, never an allow)?
 */
function guardCall(stmt: ts.Statement | undefined): string | null {
  if (!stmt || !ts.isVariableStatement(stmt)) return null;
  const list = stmt.declarationList;
  if (!(list.flags & ts.NodeFlags.Const) || list.declarations.length !== 1) return null;
  const decl = list.declarations[0];
  if (!ts.isIdentifier(decl.name) || decl.name.text !== "access") return null;
  if (!decl.initializer || !ts.isAwaitExpression(decl.initializer)) return null;
  let call = decl.initializer.expression;
  if (
    ts.isCallExpression(call) &&
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === "catch"
  ) {
    const [handler, ...rest] = call.arguments;
    if (rest.length || !handler || !ts.isIdentifier(handler) || handler.text !== "guardError") {
      return null;
    }
    call = call.expression.expression;
  }
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null;
  return GUARDS.includes(call.expression.text) ? call.expression.text : null;
}

/** Is `stmt` exactly `if (!access.ok) return ...;`? */
function isRefusal(stmt: ts.Statement | undefined): boolean {
  if (!stmt || !ts.isIfStatement(stmt) || stmt.elseStatement) return false;
  const cond = stmt.expression.getText(file).replace(/\s+/g, "");
  return cond === "!access.ok" && ts.isReturnStatement(stmt.thenStatement);
}

function findFunction(name: string): ts.FunctionDeclaration {
  const fn = exportedFunctions.find((f) => f.name?.text === name);
  if (!fn) throw new Error(`app/actions.ts has no exported function ${name}`);
  return fn;
}

function descendants(node: ts.Node): ts.Node[] {
  const out: ts.Node[] = [];
  const walk = (n: ts.Node) => {
    out.push(n);
    n.forEachChild(walk);
  };
  node.forEachChild(walk);
  return out;
}

describe("guard coverage for app/actions.ts (R4)", () => {
  it('starts with "use server"', () => {
    const first = file.statements[0];
    expect(
      first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression)
        ? first.expression.text
        : null,
    ).toBe("use server");
  });

  it("only exports `export async function NAME(...)` (no other export forms)", () => {
    const offenders = exportedStatements()
      .filter(
        ({ node }) =>
          !(
            ts.isFunctionDeclaration(node) &&
            node.name &&
            node.body &&
            hasModifier(node, ts.SyntaxKind.AsyncKeyword) &&
            !hasModifier(node, ts.SyntaxKind.DefaultKeyword)
          ),
      )
      .map(({ text }) => text);
    expect(offenders, `Only "export async function NAME(" is allowed. Found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("finds the actions (sanity check on the scan itself)", () => {
    const names = exportedFunctions.map((f) => f.name?.text);
    expect(names).toEqual(expect.arrayContaining([...PUBLIC_ACTIONS, "saveResponse", "markFinal"]));
    // The raw text agrees with the parsed view.
    const textual = [...source.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1]);
    expect(textual).toEqual(names);
  });

  it("every non-public action starts with `const access = await requireParticipant(` or `requireOrganiser(`, then refuses if !access.ok", () => {
    const problems: string[] = [];
    for (const fn of exportedFunctions) {
      const name = fn.name!.text;
      if (PUBLIC_ACTIONS.includes(name)) continue;
      const [first, second] = fn.body?.statements ?? [];
      if (!guardCall(first)) {
        problems.push(
          `${name}: first statement must be "const access = await requireParticipant(" or "const access = await requireOrganiser(", found: ${first ? first.getText(file).split("\n")[0] : "(empty body)"}`,
        );
      } else if (!isRefusal(second)) {
        problems.push(`${name}: second statement must be "if (!access.ok) return ...".`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("organiser actions take a token and use requireOrganiser", () => {
    for (const name of ["lockEarly", "unlock", "regeneratePinAction", "markFinal", "clearFinalAction"]) {
      expect(guardCall(findFunction(name).body?.statements[0]), name).toBe("requireOrganiser");
    }
    for (const name of ["pickName", "confirmName", "switchName", "saveResponse"]) {
      expect(guardCall(findFunction(name).body?.statements[0]), name).toBe("requireParticipant");
    }
  });

  it("saveResponse takes the name and device ID from the cookie, never from its input", () => {
    const fn = findFunction("saveResponse");
    const inputParam = fn.parameters[1].name.getText(file);
    const nodes = descendants(fn.body!);

    // The input is never read for a name (also through casts like `(input as X).name`).
    const isInput = (e: ts.Expression): boolean => {
      while (
        ts.isParenthesizedExpression(e) ||
        ts.isAsExpression(e) ||
        ts.isTypeAssertionExpression(e) ||
        ts.isNonNullExpression(e) ||
        ts.isSatisfiesExpression(e)
      ) {
        e = e.expression;
      }
      return ts.isIdentifier(e) && e.text === inputParam;
    };
    const readsName = nodes.some(
      (n) =>
        (ts.isPropertyAccessExpression(n) && isInput(n.expression) && n.name.text === "name") ||
        (ts.isElementAccessExpression(n) && isInput(n.expression)),
    );
    expect(readsName, `saveResponse reads a name from ${inputParam}`).toBe(false);

    // The one upsert uses access.name (last, so nothing can spread over it) and access.deviceId.
    const upserts = nodes.filter(
      (n): n is ts.CallExpression =>
        ts.isCallExpression(n) && n.expression.getText(file) === "upsertResponse",
    );
    expect(upserts).toHaveLength(1);
    const [, response, deviceId] = upserts[0].arguments;
    expect(ts.isObjectLiteralExpression(response)).toBe(true);
    const props = (response as ts.ObjectLiteralExpression).properties;
    const last = props[props.length - 1];
    expect(
      ts.isPropertyAssignment(last) && last.name.getText(file) === "name"
        ? last.initializer.getText(file)
        : null,
    ).toBe("access.name");
    expect(props.filter((p) => p.name?.getText(file) === "name")).toHaveLength(1);
    expect(deviceId.getText(file)).toBe("access.deviceId");
  });
});

// ---------------------------------------------------------------------------
// Part 2: behaviour. The guards and database calls are mocked; the rules and
// validation are the real code.
// ---------------------------------------------------------------------------

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/server/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/access")>()),
  requireParticipant: vi.fn(),
  requireOrganiser: vi.fn(),
  setJoinCookie: vi.fn(),
  clearName: vi.fn(),
  checkPin: vi.fn(),
  currentDeviceId: vi.fn(),
}));

vi.mock("@/lib/server/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/data")>()),
  getTrip: vi.fn(),
  getResponses: vi.fn(),
  getDestinations: vi.fn(),
  createTrip: vi.fn(),
  upsertResponse: vi.fn(),
  setLockedEarly: vi.fn(),
  setFinal: vi.fn(),
  clearFinal: vi.fn(),
  regeneratePin: vi.fn(),
}));

import * as actions from "@/app/actions";
import * as access from "@/lib/server/access";
import * as data from "@/lib/server/data";
import type { JoinPayload } from "@/lib/server/access";
import type { StoredResponse, Trip } from "@/lib/server/data";
import type { Destination } from "@/lib/scoring";

const m = vi.mocked;

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip_abc",
    name: "Goa?",
    participantNames: ["Asha", "Bilal", "Chirag"],
    windows: [
      { id: "w1", label: "12–16 Dec", start: "2026-12-12", end: "2026-12-16" },
      { id: "w2", label: "30 Dec – 3 Jan", start: "2026-12-30", end: "2027-01-03" },
      { id: "w3", label: "10–12 Jan", start: "2027-01-10", end: "2027-01-12" },
    ],
    deadline: "2099-09-30T23:59:59+05:30",
    pin: "042917",
    pinVersion: 3,
    organiserToken: "organiser-token",
    lockedEarly: false,
    finalDestinationId: null,
    finalWindowId: null,
    failedPinTries: 0,
    pinPausedUntil: null,
    createdAt: "2026-09-25T10:00:00+05:30",
    ...overrides,
  };
}

const PAYLOAD: JoinPayload = { tripId: "trip_abc", pinVersion: 3, deviceId: "device-1", name: "Asha" };

function asParticipant(t: Trip = trip(), name: string | undefined = "Asha") {
  m(access.requireParticipant).mockResolvedValue({
    ok: true,
    trip: t,
    payload: { ...PAYLOAD, name },
    name,
    deviceId: PAYLOAD.deviceId,
  });
}

/** A well-formed new organiser token, as the browser would send. */
const NEW_TOKEN = "N".repeat(43);

function asOrganiser(t: Trip = trip()) {
  m(access.requireOrganiser).mockResolvedValue({ ok: true, trip: t });
}

const RESPONSE = {
  budgetInr: 20000,
  availableWindowIds: ["w1", "w2", "w3"],
  dealbreakers: [],
  tripType: "beach",
};

function stored(name: string, deviceId: string, extra: Partial<StoredResponse> = {}): StoredResponse {
  return {
    name,
    budgetInr: 20000,
    availableWindowIds: ["w1", "w2", "w3"],
    dealbreakers: [],
    tripType: "beach",
    deviceId,
    updatedAt: "2026-09-25T10:00:00Z",
    ...extra,
  };
}

const DESTINATIONS: Destination[] = [
  { id: "goa", name: "Goa", costPerPersonInr: 10000, bestMonths: [12, 1], tripType: "beach", attributes: [] },
  { id: "manali", name: "Manali", costPerPersonInr: 12000, bestMonths: [12, 1], tripType: "hills", attributes: [] },
];

const WRITES = [
  () => access.setJoinCookie,
  () => access.clearName,
  () => access.checkPin,
  () => data.createTrip,
  () => data.upsertResponse,
  () => data.setLockedEarly,
  () => data.setFinal,
  () => data.clearFinal,
  () => data.regeneratePin,
];

function expectNoWrites() {
  for (const w of WRITES) expect(w()).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("guarded actions refuse without access, and never write", () => {
  const participantCalls: [string, () => Promise<{ ok: boolean }>][] = [
    ["pickName", () => actions.pickName("trip_abc", "Asha")],
    ["confirmName", () => actions.confirmName("trip_abc", "Asha")],
    ["switchName", () => actions.switchName("trip_abc")],
    ["saveResponse", () => actions.saveResponse("trip_abc", { ...RESPONSE, name: "Asha" })],
  ];
  const organiserCalls: [string, () => Promise<{ ok: boolean }>][] = [
    ["lockEarly", () => actions.lockEarly("trip_abc", "guess")],
    ["unlock", () => actions.unlock("trip_abc", "guess")],
    ["regeneratePinAction", () => actions.regeneratePinAction("trip_abc", "guess", NEW_TOKEN)],
    ["markFinal", () => actions.markFinal("trip_abc", "guess", "goa", "w1")],
    ["clearFinalAction", () => actions.clearFinalAction("trip_abc", "guess")],
  ];

  it("covers every guarded action", () => {
    const guarded = exportedFunctions
      .map((f) => f.name!.text)
      .filter((n) => !PUBLIC_ACTIONS.includes(n))
      .sort();
    expect([...participantCalls, ...organiserCalls].map(([n]) => n).sort()).toEqual(guarded);
  });

  it.each(participantCalls)("%s without a cookie → 'Please enter the PIN.'", async (_, call) => {
    m(access.requireParticipant).mockResolvedValue({ ok: false, reason: "no_cookie" });
    expect(await call()).toEqual({ ok: false, message: "Please enter the PIN." });
    expectNoWrites();
  });

  it.each(participantCalls)("%s with a cookie from an old PIN → asks for the new PIN", async (_, call) => {
    m(access.requireParticipant).mockResolvedValue({ ok: false, reason: "pin_changed" });
    expect(await call()).toEqual({
      ok: false,
      message: "The PIN has changed. Ask the organiser for the new one.",
    });
    expectNoWrites();
  });

  it.each(organiserCalls)("%s with a wrong token → refused", async (_, call) => {
    m(access.requireOrganiser).mockResolvedValue({ ok: false, reason: "bad_token" });
    expect(await call()).toEqual({ ok: false, message: "This organiser link isn't valid." });
    expectNoWrites();
  });

  it.each([...participantCalls, ...organiserCalls])(
    "%s when the guard itself throws → refused, not thrown",
    async (_, call) => {
      m(access.requireParticipant).mockRejectedValue(new Error("db down"));
      m(access.requireOrganiser).mockRejectedValue(new Error("db down"));
      expect(await call()).toEqual({
        ok: false,
        message: "Couldn't load the trip. Check your connection and try again.",
      });
      expectNoWrites();
    },
  );

  it("non-string IDs never reach the guard as anything but a string", async () => {
    m(access.requireOrganiser).mockResolvedValue({ ok: false, reason: "no_trip" });
    await actions.lockEarly({ id: "x" } as unknown as string, ["tok"] as unknown as string);
    expect(access.requireOrganiser).toHaveBeenCalledWith("", "");
  });
});

describe("createTrip", () => {
  const input = {
    tripName: "Goa?",
    participantNames: ["Asha", "Bilal"],
    windows: [
      { start: "2099-12-12", end: "2099-12-16" },
      { start: "2099-12-30", end: "2100-01-03" },
      { start: "2100-01-10", end: "2100-01-12" },
    ],
    deadlineDate: "2099-09-30",
  };

  it("creates the trip with fresh random IDs and returns them", async () => {
    m(data.createTrip).mockImplementation(async (t) => ({ ...trip(), ...t, pinVersion: 1 }));
    const r = await actions.createTrip(input);
    expect(r.ok).toBe(true);
    const created = m(data.createTrip).mock.calls[0][0];
    expect(created.deadline).toBe("2099-09-30T23:59:59+05:30");
    expect(created.windows.map((w) => w.id)).toEqual(["w1", "w2", "w3"]);
    expect(created.pin).toMatch(/^\d{6}$/);
    expect(r).toEqual({ ok: true, tripId: created.id, pin: created.pin, organiserToken: created.organiserToken });
  });

  it("ignores any id/pin/token smuggled into the input", async () => {
    m(data.createTrip).mockImplementation(async (t) => ({ ...trip(), ...t }));
    await actions.createTrip({ ...input, id: "mine", pin: "000000", organiserToken: "x" });
    const created = m(data.createTrip).mock.calls[0][0];
    expect(created.id).not.toBe("mine");
    expect(created.organiserToken).not.toBe("x");
  });

  it("bad input → plain message, nothing written", async () => {
    expect(await actions.createTrip({ ...input, participantNames: ["Asha"] })).toEqual({
      ok: false,
      message: "Add at least 2 people.",
    });
    expect(await actions.createTrip(null)).toMatchObject({ ok: false });
    expectNoWrites();
  });

  it("database failure → plain message, not thrown", async () => {
    m(data.createTrip).mockRejectedValue(new Error("network"));
    expect(await actions.createTrip(input)).toEqual({
      ok: false,
      message: "Couldn't create the trip. Check your connection and try again.",
    });
  });
});

describe("enterPin", () => {
  it("unknown trip → 'This trip link isn't valid.'", async () => {
    m(data.getTrip).mockResolvedValue(null);
    expect(await actions.enterPin("nope", "042917")).toEqual({
      ok: false,
      message: "This trip link isn't valid.",
    });
    expectNoWrites();
  });

  it("a PIN that isn't 6 digits is refused without using up a try", async () => {
    m(data.getTrip).mockResolvedValue(trip());
    for (const pin of ["4291", "0429170", "abcdef", 42917 as unknown as string]) {
      expect(await actions.enterPin("trip_abc", pin)).toEqual({
        ok: false,
        message: "Enter the 6-digit PIN.",
      });
    }
    expect(access.checkPin).not.toHaveBeenCalled();
  });

  it("right PIN → cookie with the PIN version from the atomic check, a new device ID and no name", async () => {
    m(data.getTrip).mockResolvedValue(trip()); // pinVersion 3 when read...
    m(access.checkPin).mockResolvedValue({ outcome: "ok", pinVersion: 4 }); // ...4 by the time the PIN was checked
    expect(await actions.enterPin("trip_abc", "042917")).toEqual({ ok: true });
    expect(access.checkPin).toHaveBeenCalledWith("trip_abc", "042917", expect.any(Date));
    const cookie = m(access.setJoinCookie).mock.calls[0][0];
    expect(cookie).toEqual({ tripId: "trip_abc", pinVersion: 4, deviceId: expect.any(String) });
    expect(cookie.deviceId.length).toBeGreaterThanOrEqual(20);
  });

  it("re-entering the PIN on the same phone keeps its device ID (no false 'Is this really you?')", async () => {
    m(data.getTrip).mockResolvedValue(trip());
    m(access.checkPin).mockResolvedValue({ outcome: "ok", pinVersion: 4 });
    m(access.currentDeviceId).mockResolvedValue("device-1");
    expect(await actions.enterPin("trip_abc", "042917")).toEqual({ ok: true });
    expect(access.currentDeviceId).toHaveBeenCalledWith("trip_abc");
    expect(m(access.setJoinCookie).mock.calls[0][0]).toEqual({
      tripId: "trip_abc",
      pinVersion: 4,
      deviceId: "device-1",
    });
  });

  it("wrong and paused outcomes → plain messages, no cookie", async () => {
    m(data.getTrip).mockResolvedValue(trip());
    m(access.checkPin).mockResolvedValueOnce({ outcome: "wrong", triesLeft: 7 });
    expect(await actions.enterPin("trip_abc", "111111")).toEqual({
      ok: false,
      message: "That PIN isn't right. 7 tries left.",
    });
    m(access.checkPin).mockResolvedValueOnce({ outcome: "paused", minutesLeft: 15 });
    expect(await actions.enterPin("trip_abc", "111111")).toEqual({
      ok: false,
      message: "Too many wrong tries. Try again in 15 minutes.",
    });
    m(access.checkPin).mockResolvedValueOnce({ outcome: "no_trip" });
    expect(await actions.enterPin("trip_abc", "111111")).toEqual({
      ok: false,
      message: "This trip link isn't valid.",
    });
    expect(access.setJoinCookie).not.toHaveBeenCalled();
  });

  it("database failure → plain message, not thrown", async () => {
    m(data.getTrip).mockRejectedValue(new Error("network"));
    expect(await actions.enterPin("trip_abc", "042917")).toMatchObject({ ok: false });
  });
});

describe("pickName / confirmName / switchName", () => {
  it("rejects a name that isn't on the trip", async () => {
    asParticipant(trip(), undefined);
    expect(await actions.pickName("trip_abc", "Karan")).toEqual({
      ok: false,
      message: "Pick your name from the list.",
    });
    expect(await actions.confirmName("trip_abc", "Karan")).toMatchObject({ ok: false });
    expectNoWrites();
  });

  it("no saved answers → sets the name in the cookie", async () => {
    asParticipant(trip(), undefined);
    m(data.getResponses).mockResolvedValue([]);
    expect(await actions.pickName("trip_abc", "Bilal")).toEqual({ ok: true, needsConfirm: false });
    expect(access.setJoinCookie).toHaveBeenCalledWith({
      tripId: "trip_abc",
      pinVersion: 3,
      deviceId: "device-1",
      name: "Bilal",
    });
  });

  it("answers saved from this device → sets the name without asking", async () => {
    asParticipant(trip(), undefined);
    m(data.getResponses).mockResolvedValue([stored("Bilal", "device-1")]);
    expect(await actions.pickName("trip_abc", "Bilal")).toEqual({ ok: true, needsConfirm: false });
    expect(access.setJoinCookie).toHaveBeenCalledOnce();
  });

  it("answers saved from another session → asks first and changes nothing", async () => {
    asParticipant(trip(), undefined);
    m(data.getResponses).mockResolvedValue([stored("Bilal", "device-other")]);
    expect(await actions.pickName("trip_abc", "Bilal")).toEqual({
      ok: true,
      needsConfirm: true,
      message: "Bilal's answers were saved in a different session. Is this really you?",
    });
    expectNoWrites();
  });

  it("confirmName sets the name but leaves the saved device ID alone", async () => {
    asParticipant(trip(), undefined);
    expect(await actions.confirmName("trip_abc", "Bilal")).toEqual({ ok: true });
    expect(access.setJoinCookie).toHaveBeenCalledWith({
      tripId: "trip_abc",
      pinVersion: 3,
      deviceId: "device-1",
      name: "Bilal",
    });
    expect(data.upsertResponse).not.toHaveBeenCalled();
  });

  it("switchName clears the name via clearName", async () => {
    asParticipant();
    expect(await actions.switchName("trip_abc")).toEqual({ ok: true });
    expect(access.clearName).toHaveBeenCalledWith({ ...PAYLOAD });
  });
});

describe("saveResponse", () => {
  it("saves under the cookie's name and device ID, whatever the input says", async () => {
    asParticipant();
    const r = await actions.saveResponse("trip_abc", {
      ...RESPONSE,
      name: "Bilal",
      participantName: "Bilal",
      deviceId: "evil",
    });
    expect(r).toEqual({ ok: true, savedAtText: expect.stringMatching(/^Saved at \d{1,2}:\d{2} [AP]M\. You can edit until .+ IST$/) });
    const [tripId, response, deviceId] = m(data.upsertResponse).mock.calls[0];
    expect(tripId).toBe("trip_abc");
    expect(response).toEqual({ ...RESPONSE, name: "Asha" });
    expect(deviceId).toBe("device-1");
  });

  it("refuses when the page was showing a different name (Switch in another tab)", async () => {
    asParticipant(trip(), "Bilal");
    expect(await actions.saveResponse("trip_abc", { ...RESPONSE, asName: "Asha" })).toEqual({
      ok: false,
      message: "You switched to Bilal in another tab. Reload this page before saving.",
    });
    expectNoWrites();
    expect(await actions.saveResponse("trip_abc", { ...RESPONSE, asName: "Bilal" })).toMatchObject({ ok: true });
  });

  it("zero ticked windows is allowed (Q5)", async () => {
    asParticipant();
    expect(await actions.saveResponse("trip_abc", { ...RESPONSE, availableWindowIds: [] })).toMatchObject({ ok: true });
  });

  it.each([
    [{ deadline: "2020-01-01T23:59:59+05:30" }, "The deadline has passed, so answers are locked."],
    [{ lockedEarly: true }, "The organiser has locked the trip."],
    [{ finalDestinationId: "goa", finalWindowId: "w1" }, "A final decision has been made, so answers are locked."],
  ])("blocked (%o) → %s", async (overrides, message) => {
    asParticipant(trip(overrides));
    expect(await actions.saveResponse("trip_abc", RESPONSE)).toEqual({ ok: false, message });
    expectNoWrites();
  });

  it("invalid answers → plain message, nothing written", async () => {
    asParticipant();
    expect(await actions.saveResponse("trip_abc", { ...RESPONSE, budgetInr: 12.5 })).toMatchObject({ ok: false });
    expect(await actions.saveResponse("trip_abc", { ...RESPONSE, availableWindowIds: ["w9"] })).toMatchObject({ ok: false });
    expectNoWrites();
  });

  it("database failure → 'Couldn't save…', not thrown", async () => {
    asParticipant();
    m(data.upsertResponse).mockRejectedValue(new Error("network"));
    expect(await actions.saveResponse("trip_abc", RESPONSE)).toEqual({
      ok: false,
      message: "Couldn't save. Check your connection and try again.",
    });
  });
});

describe("organiser actions", () => {
  it("lockEarly / unlock / clearFinalAction write for the guarded trip", async () => {
    asOrganiser();
    expect(await actions.lockEarly("trip_abc", "organiser-token")).toEqual({ ok: true });
    expect(data.setLockedEarly).toHaveBeenLastCalledWith("trip_abc", true);
    expect(await actions.unlock("trip_abc", "organiser-token")).toEqual({ ok: true });
    expect(data.setLockedEarly).toHaveBeenLastCalledWith("trip_abc", false);
    expect(await actions.clearFinalAction("trip_abc", "organiser-token")).toEqual({ ok: true });
    expect(data.clearFinal).toHaveBeenCalledWith("trip_abc");
  });

  it("unlock after the deadline is refused", async () => {
    asOrganiser(trip({ deadline: "2020-01-01T23:59:59+05:30", lockedEarly: true }));
    expect(await actions.unlock("trip_abc", "organiser-token")).toEqual({
      ok: false,
      message: "The deadline has passed, so the trip can't be unlocked.",
    });
    expectNoWrites();
  });

  it("regeneratePinAction returns a new PIN and a new organiser link, or explains a lost race", async () => {
    asOrganiser();
    m(data.regeneratePin).mockImplementationOnce(async (t, pin, organiserToken) => ({
      ...trip(),
      pin,
      organiserToken,
      pinVersion: t.pinVersion + 1,
    }));
    const r = await actions.regeneratePinAction("trip_abc", "organiser-token", NEW_TOKEN);
    const [, newPinArg, newTokenArg] = m(data.regeneratePin).mock.calls[0];
    expect(r).toEqual({ ok: true, pin: newPinArg, organiserToken: NEW_TOKEN });
    expect(newTokenArg).toBe(NEW_TOKEN);
    m(data.regeneratePin).mockResolvedValueOnce(null);
    expect(await actions.regeneratePinAction("trip_abc", "organiser-token", NEW_TOKEN)).toEqual({
      ok: false,
      message: "Someone else just changed the PIN. Reload to see it.",
    });
  });

  it("regeneratePinAction retried after a lost response returns the change already made", async () => {
    // The old token no longer works; the new one (sent again by the browser) does.
    m(access.requireOrganiser).mockImplementation(async (_id, tok) =>
      tok === NEW_TOKEN ? { ok: true, trip: trip({ pin: "654321", organiserToken: NEW_TOKEN }) } : { ok: false, reason: "bad_token" },
    );
    expect(await actions.regeneratePinAction("trip_abc", "organiser-token", NEW_TOKEN)).toEqual({
      ok: true,
      pin: "654321",
      organiserToken: NEW_TOKEN,
    });
    expect(data.regeneratePin).not.toHaveBeenCalled();
  });

  it("regeneratePinAction refuses a new token that isn't 32 random bytes", async () => {
    asOrganiser();
    for (const bad of ["", "short", "x".repeat(43) + "!", "a b".padEnd(43, "c")]) {
      expect((await actions.regeneratePinAction("trip_abc", "organiser-token", bad)).ok).toBe(false);
    }
    expect(data.regeneratePin).not.toHaveBeenCalled();
  });

  it("markFinal accepts only an option shown on the results page", async () => {
    asOrganiser();
    m(data.getDestinations).mockResolvedValue(DESTINATIONS);
    // Asha and Bilal both want beach and can only make w1: Goa/w1 is shown, Goa/w2 is not.
    m(data.getResponses).mockResolvedValue([
      stored("Asha", "d1", { availableWindowIds: ["w1"] }),
      stored("Bilal", "d2", { availableWindowIds: ["w1"] }),
    ]);
    expect(await actions.markFinal("trip_abc", "organiser-token", "goa", "w2")).toEqual({
      ok: false,
      message: "That option isn't on the results page any more. Reload and pick again.",
    });
    expect(await actions.markFinal("trip_abc", "organiser-token", "nowhere", "w1")).toMatchObject({ ok: false });
    expect(data.setFinal).not.toHaveBeenCalled();
    expect(await actions.markFinal("trip_abc", "organiser-token", "goa", "w1")).toEqual({ ok: true });
    expect(data.setFinal).toHaveBeenCalledWith("trip_abc", "goa", "w1");
  });

  it("markFinal with fewer than 2 answers is refused", async () => {
    asOrganiser();
    m(data.getDestinations).mockResolvedValue(DESTINATIONS);
    m(data.getResponses).mockResolvedValue([stored("Asha", "d1")]);
    expect(await actions.markFinal("trip_abc", "organiser-token", "goa", "w1")).toEqual({
      ok: false,
      message: "At least 2 people need to answer before you can pick a final option.",
    });
    expect(data.setFinal).not.toHaveBeenCalled();
  });
});
