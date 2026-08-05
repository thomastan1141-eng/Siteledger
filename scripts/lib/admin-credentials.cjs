// Bootstraps Application Default Credentials for one-off Admin SDK scripts
// by reusing the developer's existing `firebase login` session (via firebase-tools'
// own defaultCredentials helper). No service-account key is ever written to the repo.
// This must run before `firebase-admin` is required anywhere in the process.
const { getGlobalDefaultAccount } = require("firebase-tools/lib/auth");
const { getCredentialPathAsync } = require("firebase-tools/lib/defaultCredentials");

async function ensureAdcFromFirebaseLogin() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return; // explicit credentials already configured
  }
  const account = getGlobalDefaultAccount();
  if (!account) {
    throw new Error(
      "No `firebase login` session found. Run `firebase login` first, or set FIREBASE_SERVICE_ACCOUNT_JSON.",
    );
  }
  const credPath = await getCredentialPathAsync(account);
  if (!credPath) {
    throw new Error("Could not derive Application Default Credentials from firebase login session.");
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    const fs = require("fs");
    const path = require("path");
    const raw = fs
      .readFileSync(path.join(__dirname, "../../.firebaserc"), "utf8")
      .replace(/^\uFEFF/, "");
    const rc = JSON.parse(raw);
    process.env.GOOGLE_CLOUD_PROJECT = rc.projects.default;
  }
  console.log(`[admin-credentials] Using ADC derived from firebase login (${account.user.email}).`);
}

module.exports = { ensureAdcFromFirebaseLogin };
