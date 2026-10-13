# Moon Colony Bloodbath — GitHub Pages Multiplayer Setup

## What is in this ZIP?

- Original game, scans, bots and deterministic five-colony rules engine.
- An **online mode** with an invite link or seven-character room code, one human seat per browser/device, bots for unoccupied *bot-designated* seats, and live game state synchronization.
- Touch-friendly action buttons, responsive cards, room lobby and mobile layouts.
- An independent **same-device/offline** mode and JSON save/load.

**Hosting requirement:** GitHub Pages serves static files; it does not run a real-time server. Multiplayer uses Google's Firebase Realtime Database and Anonymous Authentication. This is free within Firebase's no-cost limits, but you **must create and configure your own Firebase project once** before the online buttons work. Uploading the ZIP to GitHub Pages by itself is NOT sufficient for online play.

## One-time Firebase setup (site owner)

1. Open <https://console.firebase.google.com/> and create a Firebase project (the no-cost Spark plan is sufficient for small personal games within its quotas).
2. From **Build → Realtime Database**, create a database. Note its exact **Database URL** (e.g. `https://my-project-default-rtdb.firebaseio.com` or a region-specific `.firebasedatabase.app` URL). Choose a region; do **not** leave wide-open test rules in place.
3. In Realtime Database → **Rules**, replace the entire rules JSON with the included `firebase-rules.json` and click **Publish**. These rules allow authenticated clients to create rooms and claim seats and only authorized clients to advance the shared journal. They are meant for small groups; see Security notes below.
4. From **Build → Authentication → Sign-in method**, enable **Anonymous**. There is no email/password signup for players.
5. Open **Project settings → General → Your apps**, register a **Web app** if one does not already exist. Copy the Firebase web configuration into `firebase-config.js`. Make sure you include the *actual Realtime Database URL*; it is sometimes absent from the generated snippet. Example:

   ```js
   window.MCB_FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     databaseURL: "https://your-project-default-rtdb.firebaseio.com",
     projectId: "your-project",
     appId: "1:123456789:web:abcdef..."
   };
   ```

   The Firebase **web config is designed to be public**. Never include a service-account private key or admin credentials in a public GitHub repository.
6. From Firebase Authentication → **Settings → Authorized domains**, add your GitHub Pages site hostname if required (`YOURNAME.github.io`). The automatically provided domains may include `localhost` and your Firebase domain; do not assume your GitHub domain was pre-added.
7. Upload everything **inside** the ZIP to the *root* of a GitHub repository (or a designated Pages docs folder), preserving the `assets/` directory and all filenames. Do not just upload the ZIP itself as one file.
8. GitHub repository → **Settings → Pages** → deploy from branch (`main`, root) and open the published `https://YOURNAME.github.io/REPOSITORY/` URL.

## Playing on multiple phones or computers

1. Host opens the GitHub Pages website, enters their name, picks **2–5 human seats** (or 1 for online solo with bots), and selects **Create online room**.
2. Host copies the invite URL (or sends the seven-character code) to friends.
3. Each friend opens the SAME GitHub Pages website (on their own browser/device), enters their name, and presses **Join room**. An invitation URL prefills the room code.
4. After everyone has claimed their seat, the host presses **Launch multiplayer mission**. All clients automatically load their own colony.
5. Choose actions, inspect cards, and confirm choices as usual. Moves sync after the database confirms each action. Everyone sees public boards; the interface only shows each player's own researched/forced cards.
6. A disconnected player can reload the same invitation link in the **same browser profile** to reclaim their original seat. Online mission progress persists in Firebase until manually deleted.

## Important design notes and limitations

- **Casual/trusted gameplay, not tournament-level anti-cheat.** Game seeds, decision journals, and card data live on the clients and are available to an authorized room reader; technically skilled players could inspect hidden information or modify client code. A truly secure online game needs a trusted rules server that issues private, per-player state. The UI masks other players' hands but cannot cryptographically protect them.
- **Host stays connected.** The host is responsible for bots and neutral Progress resolutions. Other people can take their own moves while the host is away, but the match stalls on bots/neutral steps until the host returns. A host should keep their tab open during play.
- **Seat identity.** Firebase Anonymous Authentication persists a browser-specific identity. Clearing website data, private browsing, or changing browser/device loses the seat credential; reconnect on the original browser. Seat takeover is intentionally not available.
- **Room access.** The room code is an unlisted invite, not a password or a confidentiality guarantee. Any authenticated visitor who knows the room code can read its game journal. Only share with people you trust.
- **Connectivity.** All players need internet. The browser loads Firebase web libraries from the official Google CDN **only when you create or join an online room**. Offline mode does not require these libraries. Large original artwork may use significant mobile data.
- **Costs and cleanup.** Firebase quotas/pricing may change. Watch your Database usage in Firebase Console and manually delete completed rooms under `/rooms` if needed. There is no automatic room cleanup.
- **Saving.** Online play is saved to Firebase at every confirmed move. `Save game` also downloads a standalone JSON backup. Local `Load game` resumes offline play only; it never overwrites an online room.
- **GitHub Pages.** GitHub Pages is just the web host; the Firebase account/database is the separate multiplayer connection. Pages is served over HTTPS as required by auth and clipboard APIs.
- **Rights.** The original game/card artwork remain the intellectual property of their respective owners. Before publishing a public repository, ensure you have rights to distribute the supplied scans, art and rulebook.

## Quick troubleshooting

- **"Firebase has not been configured"** → edit and upload `firebase-config.js` with your own web project credentials and exact database URL.
- **"auth/operation-not-allowed"** → enable Anonymous Authentication.
- **"PERMISSION_DENIED"** → publish `firebase-rules.json` in your project's Realtime Database Rules, check the URL/project match, and ensure every player has signed in anonymously.
- **"app/invalid-api-key"** or **"auth/invalid-api-key"** → fix the web `apiKey` copied from the same Firebase project.
- **Room not found** → verify all players use the same Firebase project and code.
- **Can't reconnect** → use the same original browser and website origin; your anonymous auth identity is tied to it.
- **Game stuck on a bot or Progress step** → host must reopen the room in their original browser.
- **No card images on Pages** → upload the *contents* of the ZIP including the complete `assets/` directory, with filename case preserved.
