# Installing Postloom

Download Postloom from the [Releases page](https://github.com/RavindraDave/postloom/releases).
Pick the file for your computer:

| Your computer | Download |
|---|---|
| Windows | `Postloom-…-win-x64.exe` (or, later, the Microsoft Store version) |
| Mac with Apple silicon (M1 or newer) | `Postloom-…-mac-arm64.dmg` |
| Mac with an Intel processor | `Postloom-…-mac-x64.dmg` |
| Linux (Ubuntu, Debian) | `Postloom-…-linux-amd64.deb` |
| Linux (other) | `Postloom-…-linux-x86_64.AppImage` |

Not sure which Mac you have? Open the Apple menu → **About This Mac**. "Chip:
Apple M…" means Apple silicon; "Processor: Intel" means Intel.

## Why your computer asks before opening it

Apple and Microsoft show a warning for apps that aren't signed with a paid
developer certificate. Postloom's downloads here aren't (the Microsoft Store
version is signed by Microsoft). The app is the same; the warning only means
your computer can't check who made it. Confirm once, and it opens normally
from then on.

## Mac

1. Open the `.dmg` file and drag **Postloom** into **Applications**.
2. Open Postloom from Applications. Your Mac says it can't check Postloom and
   won't open it. Click **Done** (not "Move to Bin").
3. Open **System Settings → Privacy & Security**. Scroll down to the message
   about Postloom and click **Open Anyway**. Enter your Mac password if asked.
4. Click **Open Anyway** once more. Postloom opens, and your Mac remembers the
   choice.

Updating: when a new version is out, Postloom tells you. Download it and drag
it into Applications again, replacing the old one. Your templates, lists and
settings are kept.

## Windows

1. Open the `.exe` file.
2. If Windows shows **"Windows protected your PC"**, click **More info**, then
   **Run anyway**.
3. Postloom installs for you only (no administrator password needed) and
   opens.

## Linux

- `.deb`: open it with your software installer, or run
  `sudo apt install ./Postloom-…-linux-amd64.deb`.
- `.AppImage`: make it runnable (right-click → Properties → Permissions →
  "Allow executing file as program", or `chmod +x Postloom-….AppImage`), then
  open it.

## Checking a download (optional)

Each download has a `.sha256` file next to it. To check a file arrived intact:

- Mac and Linux: `shasum -a 256 Postloom-…` (or `sha256sum Postloom-…`)
- Windows (PowerShell): `Get-FileHash Postloom-….exe`

The long code printed should match the one in the `.sha256` file.
