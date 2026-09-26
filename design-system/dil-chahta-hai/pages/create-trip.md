# Page: Create trip (`/`) and the "created" screen

Follows MASTER. Actions used: `createTrip`.

## Create form (top to bottom, one column)

```
Dil Chahta Hai                          ← wordmark
Plan the trip                           ← h1 (Fredoka)
One link for everyone. Everyone adds    ← muted intro, 2 lines max
their dates and budget; the app ranks the options.

[Trip name ___________________]         TextField
Who's going?                            h2
[Name 1 ____] [Name 2 ____] …           TextFields, starts with 5 rows; "+ Add person" quiet button (max 10); 2 minimum
Date options                            h2  "Add 3 or 4 date ranges"
 Option 1  [Start date] [End date]      date inputs side by side, stacked below 360px
 … ×3 (4th via "+ Add option")
Deadline                                h2
 [Date] [Time 23:59]                    helper: "Answers lock at this time (India time)."
[ Create trip ]                         primary Button, pending: "Creating…"
```

- A server error (a single `message`) appears in an error Notice just above the button, which gets focus. Messages that name a field ("Date option 2 …") are also shown under that field.

## Created screen (same URL, shown after success)

```
Trip created ✓                          h1 + success tick
Share these two in your WhatsApp group: Notice (info)
 Trip link   [https://…/t/xxxx] [Copy]  CopyField
 PIN         [ 042917 ]         [Copy]  CopyField, 28px tabular digits
Keep this one to yourself:              Notice (warning) = SaveThisLink
 Organiser link [https://…/o/…] [Copy]
[ Open the trip ]  (secondary)          → /t/{id}
[ Open organiser page ] (quiet)         → /o/{id}/{token}
```

- The organiser link is shown only here and on the organiser page. It never appears on friend pages.
