# Page: Trip home (`/t/[tripId]`)

Follows MASTER. Actions used: `enterPin`, `pickName`, `confirmName`, `switchName`.
The server decides which step to render from `requireParticipant`: no cookie → PIN; no name → name picker; otherwise → home.

## Step 1: PIN

```
{Trip name}                             h1
Enter the trip PIN                      h2
[ • • • • • • ]                         PinField (paste allowed)
[ Continue ]                            primary, pending "Checking…"
```

- Show errors under the field, using the action's exact text ("That PIN isn't right. 7 tries left.", "Too many wrong tries. Try again in 12 minutes.").
- If the PIN has changed, show a Notice: "The PIN has changed. Ask the organiser for the new one."
- An invalid link shows a whole-page message: "This trip link isn't valid."

## Step 2: Who are you?

```
Who are you?                            h2
( ) Asha   ( ) Bilal   ( ) Chirag …     ChoiceCards (radio), one per participant
[ Continue ]
```

- If the action returns `needsConfirm`, open a ConfirmDialog with its exact message. **Yes** → `confirmName`. **No** → close and stay on the picker.

## Step 3: Home

```
You're Asha · Not you? Switch           small row, quiet link (switchName)
[DecisionBanner] Decided: Goa, 12–16 Dec   ← only when final is set
{Trip name}                             h1
Answers lock Wed 30 Sep, 11:59 PM IST   muted
[ Add / edit my answers ]               primary → /t/{id}/form (hidden or disabled + reason when locked)

Who has answered                        h2
 Asha    ✓ Submitted   updated 9:42 PM  StatusRows
 Karan   ◷ Pending
Results                                 h2 + Badge (Provisional / Results (locked))
 Based on 4 of 5. Waiting on: Karan.    muted, from computeResults().label
 [ResultCard] ×2–3                      passing, then flagged (per the design doc rules 5–6)
```

- With fewer than 2 submitters: Notice "Results appear once 2 people have answered." and no cards.
- With no destinations loaded (the data isn't set up yet): Notice "No destinations have been added yet." The results area must never be blank.
