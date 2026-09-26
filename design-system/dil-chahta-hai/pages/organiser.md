# Page: Organiser (`/o/[tripId]/[token]`)

Follows MASTER. Actions used: `lockEarly`, `unlock`, `regeneratePinAction`, `markFinal`, `clearFinalAction`.
A bad token shows a whole-page message: "This organiser link isn't valid." (It may have been replaced by Regenerate PIN.)

```
Organiser                               small label
{Trip name}                             h1
[DecisionBanner]                        when final is set, with "Clear final choice" (quiet)

Share                                   h2
 Trip link [Copy]   PIN [042917] [Copy] CopyFields

Who has answered                        h2  (same StatusRows as trip home)

Results                                 h2 + Badge
 [ResultCard] each with [ Mark as final ]   accent Button → ConfirmDialog "Mark {Goa, 12–16 Dec} as the final choice? Friends' answers will lock."

Trip controls                           h2
 [ Lock now ]         danger-outline → ConfirmDialog "Lock now? Friends can't edit until you unlock."
 [ Unlock ]           shown when locked early and before the deadline
 [ Regenerate PIN ]   secondary → ConfirmDialog "Make a new PIN and a new organiser link? The old ones stop working."
```

- After Regenerate PIN: show the new PIN and the new organiser link inside SaveThisLink, then move the browser to the new organiser URL (the old one no longer works).
- Results here use the same ResultCard as trip home, plus the Mark-as-final button. Only shown options can be marked (the action enforces this).
