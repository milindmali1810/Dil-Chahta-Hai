# Dil Chahta Hai — V1 Design Doc

Status: **Draft for review.** Nothing is built yet. This doc describes *what* V1 does and *how it behaves*. It is not a build plan.

---

## 1. The problem (from the brief)

Five friends have spent months in a WhatsApp group without confirming a trip. A form got 3 of 5 responses. A poll collapsed when two people changed their minds.

The app turns everyone's constraints into **2–3 ranked options** (destination + date window). It shows **where each person stands on each option**, so the group can make one decision.

## 2. Scope

### In V1 (only this)

1. Organiser creates a trip: name, participant names, 3–4 candidate date windows, a deadline. Gets one link and a PIN.
2. Friends open the link, enter the PIN, pick their name.
3. Each person submits: budget ceiling (INR), which date windows they can do, dealbreaker checkboxes, one trip type (beach / hills / city / adventure / no preference). They can edit until the deadline. After that it is locked.
4. Status page: submitted or pending for each person, with last-updated time.
5. Results: top 2–3 options from a curated list of about 10 destinations stored in the database. Each shows every person's fit score and a one-line reason. It works with partial responses and is labelled "N of 5".
6. Organiser can mark one option as the final decision.

### Not in V1

Shared notes, checklists, expense splitting, AI-generated destinations, payments, Google login.

### Stack

- **Next.js**: the website itself, meaning the pages and the server code behind them.
- **Supabase**: the database where trips, answers and destinations are stored.
- **Vercel**: hosts the website on the internet.

---

## 3. How it works, step by step

```
Organiser                                   Friends
─────────                                   ───────
Fills "Create trip" form
  │
  ├─► gets: Share link + PIN  ──(pastes in WhatsApp)──►  Opens link
  └─► gets: Organiser link (private)                     Enters PIN
                                                         Picks own name
                                                         Fills 4 questions ─► saved
                                                         (can come back and edit
                                                          until the deadline)
Both can see:
  • Status page  – who has answered, who hasn't, when each person last updated
  • Results page – top options, everyone's score on each, "N of 5 responded"

Organiser only (via Organiser link):
  • "Mark as final" button on one option
```

Note the **Organiser link**. The brief says the organiser gets "one link and a PIN". If friends get that same link and PIN, any friend could press "Mark as final". Section 8 explains why the organiser needs a second, private link.

---

## 4. Pages

| Page | Address (example) | Who uses it | What it shows |
|---|---|---|---|
| Create trip | `/` | Organiser | Form: trip name, 5 names, 3–4 date windows, deadline. On submit, shows the share link, the PIN and the organiser link. |
| Join | `/t/k7Qm2xPa9r` | Friends | PIN box, then "Who are you?" with a list of names. |
| My answers | `/t/k7Qm2xPa9r/me` | Friends | The 4-question form, pre-filled if they already answered. After the deadline it is read-only. |
| Status | `/t/k7Qm2xPa9r/status` | Everyone | Each name: ✅ Submitted (updated 2h ago) or ⏳ Pending. The deadline countdown. |
| Results | `/t/k7Qm2xPa9r/results` | Everyone | Top 2–3 options, a per-person score grid and the "3 of 5 responded" label. After a decision, the final option is shown at the top. |
| Organiser | `/t/k7Qm2xPa9r/admin/<secret>` | Organiser | The same results, plus a "Mark as final" button on each option. |

`k7Qm2xPa9r` is a random code made when the trip is created. It is long enough that nobody can guess another trip's address.

---

## 5. What gets stored (data model)

Think of each table as a spreadsheet tab.

**`destinations`**: the curated list of about 10 places. It is filled in once by you, not by users.

| column | example | meaning |
|---|---|---|
| name | Coorg | |
| trip_type | hills | one of beach / hills / city / adventure |
| est_cost_inr | 15000 | estimated cost per person for the whole trip (travel + stay + food) |
| flags | `{long_travel}` | which dealbreakers this place triggers (see §6.1) |
| season | `[100,100,100,50,0,0,0,0,50,100,100,100]` | how good each month is, Jan→Dec: 100 = good, 50 = okay, 0 = bad |

**`trips`**: one row per trip.

| column | meaning |
|---|---|
| slug | the random code in the link |
| name | "Goa 2026?" |
| pin_hash | the PIN, scrambled so it isn't stored in readable form |
| admin_secret_hash | the organiser link's secret, scrambled |
| deadline | date and time (India time) after which answers lock |
| final_destination_id, final_window_id | empty until the organiser marks a final option |
| finalised_at | when they did it |

**`date_windows`**: 3–4 rows per trip, for example "Oct 10–13" with start and end dates.

**`participants`**: 5 rows per trip, just the names.

**`responses`**: at most one row per participant. Editing replaces the row.

| column | meaning |
|---|---|
| budget_inr | their ceiling |
| available_window_ids | which date windows they can do |
| dealbreakers | which boxes they ticked |
| trip_type | beach / hills / city / adventure / none |
| updated_at | shown on the status page |

"Submitted" = a `responses` row exists. "Pending" = it doesn't.

---

## 6. Scoring (plain code, no AI)

An **option** = one destination + one date window. With 10 destinations and 4 windows there are 40 options.

Only people who have **submitted** are counted. Pending people are ignored until they answer.

### 6.1 Step 1: remove options that are impossible

An option is removed if, for **any** submitted person:

- they said they **can't do** that date window, **or**
- the destination has a flag matching one of their **dealbreakers**.

Proposed dealbreaker checkboxes. Each one needs a matching flag on destinations, so the list must be short and concrete:

| Checkbox | Destination flag |
|---|---|
| No long travel (over ~10 hours each way) | `long_travel` |
| No flights | `flight` |
| No cold places (below ~10 °C) | `cold` |
| No strenuous activities (treks, rafting) | `strenuous` |

→ **You need to confirm this list** (§10).

### 6.2 Step 2: score each person on each remaining option (0–100)

```
person_score = 0.5 × budget + 0.3 × trip_type + 0.2 × season      (rounded to a whole number)
```

- **budget** (0–100)
  - 100 if the destination's cost is at or under their ceiling.
  - 0 if the cost is 50 % or more above their ceiling.
  - In between, it drops in a straight line. Example: ceiling ₹20k, cost ₹25k → 25 % over → 50.
  - Being *under* budget earns nothing extra. A ₹10k trip and a ₹19k trip both score 100 for a ₹20k person. Otherwise the cheapest place would always win.
- **trip_type** (0–100)
  - 100 if the destination's type matches their pick, or they picked "no preference".
  - 0 otherwise.
- **season** (0–100)
  - Taken from the destination's month table.
  - If a date window spans two months, it is averaged by number of days.
  - Note: season is the same for every person on a given option. It raises or lowers the whole option and never changes *who* is worst-off.

### 6.3 Step 3: rank

Sort the remaining options by:

1. **Lowest individual score**, highest first. This is the "worst-off person" rule.
2. then **group average score**, highest first
3. then **lower cost**
4. then **destination name A→Z**. This last rule is not in the brief. It is needed so the order never shuffles between page loads when everything else is tied.

Show the top 3. Show fewer if fewer survive.

### 6.4 The one-line reason

For each person on each option, the reason names the part that cost them the most points. If nothing cost points, it says what fits.

- "Over budget" / "Stretches budget"
- "Wanted beach"
- "Off-season in November"
- "Fits budget, matches hills"

### 6.5 Partial responses

The label reads **"Based on 3 of 5. Amit and Neha haven't answered and could still rule these out."** Only submitted people can knock an option out, so early results always look better than final results.

### 6.6 When nothing survives

If step 1 removes every option, the Results page says **"No option works for everyone yet"**. It then shows, for each date window, who can't make it, and which dealbreakers remove the most destinations. This is not a new feature. It is how item 5 ("where each person stands") behaves when the list is empty. §7 explains why this will happen often.

---

## 7. Challenge 1: Will ranking by the worst-off person give sensible results for 5 people?

**Short answer: mostly yes, but not for the reason you expect.** The "worst-off person" rule will rarely decide the ranking by itself. The bigger risk is that step 1 leaves nothing to rank.

I tested this by simulating 20,000 random 5-person groups. The setup: 10 made-up Indian destinations, 4 date windows, budgets of ₹12k–60k, each person ticking each dealbreaker 15 % of the time, and trip types picked at random. The groups are random, not real, so treat the numbers as *direction*, not prediction.

| Chance each person can do a given window | No option survives step 1 | Top two tied on lowest score (average decides) | Winner is the cheapest surviving option |
|---|---|---|---|
| 90 % | 3 % | 80 % | 35 % |
| 80 % | 20 % | 68 % | 32 % |
| 70 % | **48 %** | 61 % | 30 % |

What this means:

1. **The hard filter is the real threat.** One "can't do it" from one person kills a whole date window. With 5 people and only 3–4 windows, a group like yours (months of not agreeing) could easily see an empty results page. That is why §6.6 is not optional.
2. **The worst-off score ties most of the time, so the group average usually picks the winner.** The cause is trip type. Each person picks one of 5 options, so almost every destination has at least one person whose type doesn't match, and that person gets 0 on 30 % of their score. The "lowest score" then lands on the same few values (50, 60, 70…) for most options. In practice the rule acts as a **floor**: it knocks out options that are bad for someone, and the average ranks the rest. For friends, that is a sensible outcome.
3. **One low budget does not automatically win.** I expected the poorest person to dictate the answer, but they were the worst-off person in the winning option only about half the time. This is because budget scores 100 for anything under the ceiling (§6.2).
4. **One typo can still steer everything.** Someone who types ₹5,000 instead of ₹50,000 becomes the worst-off person on every option. The form should reject budgets under about ₹3,000 or over ₹5,00,000 and show the number back in words ("fifty thousand rupees").

**Recommendation:** keep the rule as briefed. Add the deterministic final tie-break (§6.3 step 4), the empty-results screen (§6.6) and budget sanity limits. Do **not** give partial credit for a trip-type mismatch to "fix" the ties. It shifts every mismatched person by the same amount and changes nothing.

---

## 8. Challenge 2: Is PIN + pick-your-name enough access control for a group of friends?

**Short answer: it is enough to keep strangers out. It does nothing about the two risks that actually matter here. Both are cheap to fix.**

### 8.1 Risk you're not seeing #1: the database may be open to anyone

Supabase lets a website talk to the database directly from the visitor's browser, using a key that is visible to anyone who opens the page. If the database's safety rules (called **Row Level Security**) are off or written loosely, anyone can read every trip, every budget and every PIN. They wouldn't need the link or the PIN at all. This is the most common mistake beginners make with Supabase.

**Design rule:**
- The browser **never** talks to the database.
- Every read and write goes through Next.js server code, which checks the PIN first.
- Row Level Security is turned **on** for every table with **no** public access rules, so the browser key can do nothing.
- The powerful server key lives only in Vercel's secret settings and is never sent to the browser.

### 8.2 Risk you're not seeing #2: nothing protects the "Mark as final" button

With one link and one PIN for everyone, any friend can mark the final decision.

**Design rule:** on creation, the organiser gets a second, **private organiser link** containing a long random secret. There is no login. Only that link shows the "Mark as final" button, and the server checks the secret again when the button is pressed.

### 8.3 The realistic failure is a mistake, not an attack

Friends won't impersonate each other on purpose. Someone *will* tap the wrong name on a small phone screen and overwrite a friend's answers. After what happened to your poll, that is the thing most likely to break trust in the app.

**Design rules:**
- After someone picks a name, the device remembers it for this trip. A banner shows **"You're answering as Priya · Not you?"**
- If a name already has answers from a different device, show a warning before editing: **"Priya already answered on another device (updated Tue 3:14 pm). Edit anyway?"**
- The status page already shows last-updated times, so an unexpected edit is visible to the group. You get an audit trail for free.

### 8.4 What the PIN actually does

The PIN will almost certainly be pasted into WhatsApp right next to the link. So it doesn't keep out anyone in the group. It keeps out people who get the link *without* the PIN, like a forwarded message or a screenshot. The random link code does most of the real protection. The PIN's rules:
- 4 digits, stored scrambled (hashed).
- Lock out after 10 wrong tries for 15 minutes.
- Once entered correctly, the device stays signed in to that trip, so nobody retypes it.

### 8.5 A privacy side-effect that could break the scoring

The results page shows every person's score and reason. If it says "₹6k over budget" next to the destination cost, everyone can work out that person's exact budget. People who don't want to look broke in front of friends will **inflate their budget**. Then the worst-off rule protects nobody.

**Recommendation:** others see only "Over budget" / "Stretches budget", never rupee amounts. Each person sees their own exact numbers.

**Verdict:** PIN + pick-your-name is enough for 5 friends **if** you add §8.1 and §8.2, which are non-negotiable, and §8.3, which is cheap. Per-person links would be stronger, but the organiser would have to send 5 separate messages. That friction is exactly what already failed with the form, so I would not do it.

---

## 9. Other behaviour the brief implies

- **Deadline:** India time. After it passes, forms are read-only and "Submit" is replaced by "Answers are locked". Pending people stay pending. Results stay visible.
- **Marking final:** allowed at any time, even before the deadline, with a warning if fewer than 5 have answered. The final option is pinned to the top of Results for everyone. The organiser can switch it to a different option in case of a misclick.
- **Editing after results are visible:** allowed until the deadline. Results always recompute from the latest answers, so a changed mind moves the ranking instead of breaking it. This is the fix for your collapsed poll.

## 10. Decisions I need from you before building

1. **Dealbreaker list.** Are the 4 checkboxes in §6.1 the right ones?
2. **Where does everyone travel from?** One cost per destination only works if all 5 leave from the same city. If not, costs need to be rough and labelled "approx."
3. **How long are the date windows?** Destination cost assumes all windows are roughly the same length, for example a long weekend. If one window is 3 days and another is 7, one cost number is wrong for one of them.
4. **Budget privacy (§8.5).** Hide rupee amounts from others: yes or no?
5. **Empty results (§6.6).** Show "who can't make which window", which names the person blocking. Some groups find that awkward. The alternative is showing counts only ("2 people can't do Oct 10–13").
