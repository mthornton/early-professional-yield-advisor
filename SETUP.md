# Running the prototype on a locked-down Mac

Follow the steps in order. Each step tells you what to run, what you should see, and what to write down if it fails. Don't work around a failure yourself (for example by turning off security checks). Note the exact error and move on to the fallback the step names.

There are two ways to run the prototype:

| | **Plan A: full setup** | **Plan B: standalone file** |
| --- | --- | --- |
| Needs | Terminal, Node.js, npm package downloads | Only a web browser |
| You get | The live dev server, tests, the ability to edit and rebuild | The same app in one HTML file you double-click |
| Model mode | Key from `.env.local` or pasted | Key pasted into the demo panel each time |

If Plan A gets stuck at any step, jump to [Plan B](#plan-b-standalone-file-no-install). It covers the whole demo.

---

## Step 1: Get the code

You need the repository `mthornton/early-professional-yield-advisor`. It's private, so you must be signed in to GitHub as `mthornton` (or be added as a collaborator).

Before you start, check that your company allows a personal GitHub repository on a work laptop.

**Option 1a, no tools needed (try this first):**

1. In the browser, go to https://github.com/mthornton/early-professional-yield-advisor and sign in.
2. Click **Code → Download ZIP**.
3. Double-click the ZIP in Downloads to unzip it. You get a folder named `early-professional-yield-advisor-main`.

**Option 1b, with git** (needed later only if you want to pull updates):

```bash
git --version
```

- **Expect:** `git version 2.x`.
- **If you see a pop-up asking to install Command Line Developer Tools:** click Install. If it asks for an admin password you don't have, cancel and use Option 1a.

```bash
cd ~/Documents
git clone https://github.com/mthornton/early-professional-yield-advisor.git
```

- **If it asks for a username and password:** GitHub no longer accepts your account password here. Create a token at github.com → Settings → Developer settings → Personal access tokens → Fine-grained, with read access to this one repository, and paste it as the password.
- **Write down if it fails:** the full error text, for example `Could not resolve host`, `SSL certificate problem` or `403`.

**Have the prototype ready even if nothing else works:** the folder includes `standalone/yield-advisor.html`. Opening it is Plan B.

---

## Step 2: Open Terminal in the project folder

1. Open **Terminal** (Spotlight: ⌘-Space, type "Terminal").
2. Type `cd ` (with a trailing space), drag the project folder from Finder into the Terminal window, and press Return.
3. Check you're in the right place:

```bash
ls
```

- **Expect:** `README.md`, `SETUP.md`, `package.json`, `src`, `standalone` and others.
- **If Terminal is blocked:** go straight to Plan B.

---

## Step 3: Check for Node.js

```bash
node --version
npm --version
```

- **Expect:** Node `v18.x`, `v20.x`, or `v22` or newer, and npm `9` or newer.
- **If it says `command not found`, or Node is v16 or older:** go to Step 3a.

### Step 3a: Install Node.js

Try these in order. Stop at the first one that works.

1. **Company software portal.** Look in **Self Service** (or your company's equivalent app catalog) for "Node.js" (an LTS version, 20 or 22). This is the approved route if it's there.
2. **Request it.** Ask IT for Node.js LTS. The reason: "local web development prototype, runs only on localhost."
3. **No-admin install into your home folder** (only if your company's policy allows downloaded tools):

```bash
uname -m
```

`arm64` means Apple silicon (M1–M4). `x86_64` means Intel. Then:

```bash
mkdir -p ~/tools && cd ~/tools
curl -fLO https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
grep "darwin-$(uname -m | sed 's/x86_64/x64/').tar.gz" SHASUMS256.txt
```

That shows the exact file name, for example `node-v22.x.y-darwin-arm64.tar.gz`. Download and unpack it, replacing the file name with the one shown:

```bash
curl -fLO https://nodejs.org/dist/latest-v22.x/node-v22.x.y-darwin-arm64.tar.gz
shasum -a 256 -c SHASUMS256.txt --ignore-missing
tar -xzf node-v22.x.y-darwin-arm64.tar.gz
echo 'export PATH="$HOME/tools/node-v22.x.y-darwin-arm64/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node --version
```

- **Expect:** the checksum line ends in `OK`, and `node --version` prints `v22…`.
- **If you get `"node" cannot be opened because the developer cannot be verified`, or Node is killed straight away:** your Mac blocks unsigned downloads. Don't override it. Use option 1 or 2, or Plan B.
- **Write down if it fails:** which option you tried and the exact message.

Then go back to the project folder (repeat Step 2).

---

## Step 4: Install the project's packages

```bash
npm install
```

- **Expect:** `added NN packages` after 10–60 seconds. Warnings marked `npm warn` are fine.

**Common failures, and what to note:**

| You see | Likely cause | What to note or try |
| --- | --- | --- |
| `ETIMEDOUT`, `ECONNREFUSED`, `ENOTFOUND registry.npmjs.org` | npm's public registry is blocked | Run `npm config get registry` and write down the result. Ask IT whether there's an internal npm mirror (often Artifactory or Nexus) and its URL. |
| `SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | The company network inspects HTTPS traffic | Ask IT for the corporate root certificate file (`.pem`). Then run `npm config set cafile /path/to/that.pem` and retry. **Don't** set `strict-ssl false`. |
| `E401`, `E403` | The mirror needs a login, or this package isn't approved | Note which package is named in the error |
| `EACCES` permission error | Writing to a folder you don't own | Make sure the project folder is under your home folder (for example `~/Documents`) |

If you can't get past this step, use Plan B.

---

## Step 5: (Optional) Run the tests

```bash
npm test
```

- **Expect:** `Tests 28 passed (28)`.
- A failure here doesn't block the demo. Note the output and continue.

---

## Step 6: Start the app

```bash
npm run dev
```

- **Expect:** a line like `Local: http://localhost:5199/`. Open that address in Chrome, Edge or Safari. You should see the persona picker.
- Leave this Terminal window open while you demo. Press Ctrl-C to stop.
- **If the browser can't reach localhost**, or Terminal says port 5199 is in use, try another port:

```bash
npm run dev -- --port 5173
```

- **If the browser shows a security block page for localhost:** note the wording and who it's from (the browser, or a company tool such as Zscaler or Netskope).

---

## Step 7: Check Scripted mode

In the app:

1. Pick **Priya** in the persona picker.
2. Click **Ask a question**, then type "Do you have a high yield savings account?".
3. Agree to data use. You should see 4 ranked options, with the Treasury money market fund first.
4. Click **Plan & track** in the top bar, agree, then **Show my options**. You should see the same ranking.

Scripted mode needs no internet access at all.

---

## Step 8: Model mode (needs access to openrouter.ai)

First check whether the work network can reach OpenRouter:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://openrouter.ai/api/v1/models
```

- **Expect:** `200`.
- **If you get `000`, `403`, or a block page:** the site is blocked. The demo still runs in Scripted mode. Note the result.

Also check with your manager or IT whether using an outside AI service from a work laptop is allowed for this demo. All customer data in the prototype is simulated, but the call does go to an outside service.

**To use the key**, pick one:

- **Paste it (simplest):** in the demo panel, choose **Mode → Model** and paste the key into the password field. The key lasts until the page reloads.
- **Save it for the dev server:** create a file named `.env.local` in the project folder containing one line, `VITE_OPENROUTER_API_KEY=<your key>`. Then stop and restart `npm run dev`. Git already ignores this file, so it won't be committed.

**Test it:** in Model mode, ask the chat "How much did I spend last month?". The answer should carry a **model answer** tag. If it falls back to the scripted reply, show the rule trace in the demo panel and note the "Answer call" line. It includes the error, for example `HTTP 401` (bad key) or `Failed to fetch` (blocked by the network).

---

## Plan B: Standalone file (no install)

1. In Finder, open the project folder, then `standalone`.
2. Double-click `yield-advisor.html`. It opens in your default browser.
3. Everything works the same as Plan A: the persona picker, chat, cash options page, demo panel and rule trace.
4. **Model mode:** choose Model in the demo panel and paste the key. It needs openrouter.ai to be reachable (Step 8). The file never contains a key.

**If double-clicking shows a blank page:** try another browser (Chrome or Edge), or drag the file onto an open browser window. If it's still blank, note the browser and version. Also note any message in the developer console (View → Developer → JavaScript Console in Chrome).

**If the file can't be downloaded or opened** (for example, quarantined by security software), note the message. Other options to discuss: hosting the file somewhere your company allows, or demoing from another machine.

To rebuild this file after code changes (on a machine with Node), run `npm run build:standalone`.

---

## What to send back

Copy this, fill it in, and paste it into the chat:

```
Mac: Apple silicon or Intel? (uname -m) ______   macOS version: ______
Step 1 (get code): worked / failed — option used: ___ — error: ___
Step 3 (node --version): ______   npm --version: ______
Step 3a (if needed): option tried: ___ — result/error: ___
Step 4 (npm install): worked / failed — error lines: ___
          npm config get registry: ______
Step 5 (npm test): ______
Step 6 (npm run dev + browser): worked / failed — error: ___
Step 7 (scripted demo): worked / failed — what you saw: ___
Step 8 (curl openrouter): status code ___ ; model answer worked? ___ ; trace error: ___
Plan B (standalone file): worked / failed — browser: ___ — error: ___
```

Leave out the OpenRouter key and any internal passwords or tokens. Hostnames and error text are fine.
