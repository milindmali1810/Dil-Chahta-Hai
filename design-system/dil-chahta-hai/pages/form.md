# Page: Preference form (`/t/[tripId]/form`)

Follows MASTER. Action used: `saveResponse` (input: `{ budgetInr: number, availableWindowIds, dealbreakers, tripType }`).
The budget must be converted to a **number** before it is sent.

```
You're Asha · Not you? Switch
Your answers                             h1
Answers lock Wed 30 Sep, 11:59 PM IST    muted

Budget per person                        h2
[₹ 15000        ]                        BudgetField
  "Your exact number is never shown to the group. It's only used for scoring."
  "Costs assume travel from {city}."

Which dates can you do?                  h2  "Tick all that work"
[✓] 12–16 Dec   [ ] 30 Dec – 3 Jan …     ChoiceCards (checkbox); zero ticked is allowed

What kind of trip?                       h2
( ) Beach ( ) Hills ( ) City ( ) Adventure ( ) No preference   ChoiceCards (radio)

Anything you'd rule out?                 h2  "Optional"
[ ] International travel [ ] Trekking [ ] An overnight journey   ChoiceCards (checkbox), labels from DEALBREAKER_LABELS

[ Save as Asha ]                         primary, sticky bottom bar with safe-area padding; pending "Saving…"
```

- On success, show a success Notice with the action's `savedAtText` ("Saved at 9:42 PM. You can edit until …") and keep the form filled in.
- **Pre-fill:** use the saved answers. Pre-fill the budget **only if** the saved device ID equals this phone's cookie device ID; otherwise leave it blank with the helper "Type your budget again".
- **Locked** (deadline, early lock or final choice): all fields are read-only, a Notice gives the reason (the action's exact strings), and there's no save button.
