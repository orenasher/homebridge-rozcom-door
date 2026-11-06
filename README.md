# homebridge-rozcom-door

English | [עברית](#עברית)

## English

Open your building's entrance door from Apple Home. The plugin shows a Rozcom Smart Intercom door as a HomeKit lock.

### Installation
1. In Homebridge UI open **Plugins**, search for `homebridge-rozcom-door` and click **Install**.
2. Open the plugin **Settings**, add a door, fill in the fields, save, and restart Homebridge.

### Settings
| Field | Meaning |
|---|---|
| `name` | Name shown in Apple Home, e.g. Front Door |
| `topic` | `Intercom/BUILDING_ID/startcall` |
| `payload` | `openDoor1:CODE` (case sensitive) |
| `mqttHost` | MQTT broker of the intercom system (default `62.219.14.161`) |
| `mqttPort` | Usually `1883` |
| `unlockSeconds` | How long the lock shows "unlocked" before returning to locked, 1-30 (default `2`) |

Example (`config.json`):
```json
{
  "platform": "RozcomDoor",
  "name": "Rozcom Door",
  "doors": [
    { "name": "Front Door", "topic": "Intercom/BUILDING_ID/startcall", "payload": "openDoor1:CODE", "unlockSeconds": 2 }
  ]
}
```

### Adding to Apple Home
1. After restarting Homebridge, open the Home app. If Homebridge is already paired, the lock appears by itself.
2. Otherwise tap **+**, **Add Accessory**, and scan the QR code from the Homebridge UI home page (or enter the PIN).
3. Tap the lock to open the door. It returns to locked after `unlockSeconds`.

If the intercom server can't be reached, Apple Home shows "No Response" instead of pretending the door opened.

### Moving from the old `accessories` setup
Older versions were configured under `accessories`. That still works, but the log shows a warning. To move to the platform, put the same values in a `doors` entry (above) and remove the old accessory. Apple Home will treat it as a new lock (room, name and automations must be set again), so do it once.

### Finding your values
The values come from the MQTT traffic of the Rozcom app. Do this only for your own door, and keep your building ID and code private. Never publish them.

### Support
If this plugin is useful to you, you can support its development: https://paypal.me/orenasher

## עברית

פתיחת דלת הכניסה של הבניין מאפליקציית הבית של אפל. הפלאגין מציג את האינטרקום החכם של Rozcom כמנעול ב-HomeKit.

### התקנה
1. ב-Homebridge UI עבור ל-**Plugins**, חפש `homebridge-rozcom-door` ולחץ **Install**.
2. פתח את **Settings** של הפלאגין, הוסף דלת, מלא את השדות, שמור והפעל מחדש את Homebridge.

### הגדרות
| שדה | משמעות |
|---|---|
| `name` | השם באפליקציית הבית, למשל דלת כניסה |
| `topic` | `Intercom/BUILDING_ID/startcall` |
| `payload` | `openDoor1:CODE` (רגיש לאותיות גדולות וקטנות) |
| `mqttHost` | שרת ה-MQTT של האינטרקום (ברירת מחדל `62.219.14.161`) |
| `mqttPort` | בדרך כלל `1883` |
| `unlockSeconds` | כמה זמן המנעול מוצג כפתוח לפני שהוא חוזר לנעול, 1-30 (ברירת מחדל `2`) |

### הוספה לאפליקציית הבית
1. אחרי הפעלה מחדש של Homebridge, פתח את אפליקציית Home. אם Homebridge כבר מחובר, המנעול יופיע לבד.
2. אם לא: לחץ **+**, **הוסף אביזר**, וסרוק את קוד ה-QR מדף הבית של Homebridge UI (או הזן את ה-PIN).
3. לחץ על המנעול כדי לפתוח את הדלת. הוא חוזר לנעול אחרי `unlockSeconds`.

אם אי אפשר להגיע לשרת האינטרקום, אפליקציית הבית תציג "אין תגובה" במקום להעמיד פנים שהדלת נפתחה.

### מעבר מהגדרה ישנה תחת `accessories`
גרסאות ישנות הוגדרו תחת `accessories`. זה עדיין עובד, אבל מופיעה אזהרה בלוג. למעבר לפלטפורמה, העתק את אותם ערכים לרשומה תחת `doors` (ראה למעלה) והסר את האביזר הישן. אפליקציית הבית תראה מנעול חדש (צריך להגדיר מחדש חדר, שם ואוטומציות), לכן עושים זאת פעם אחת.

### איך מוצאים את הערכים
הערכים נלקחים מתעבורת ה-MQTT של אפליקציית Rozcom. עשה זאת רק עבור הדלת שלך, ושמור את מספר הבניין והקוד בסוד. לעולם אל תפרסם אותם.

### תמיכה
אם הפלאגין שימושי לך, אפשר לתמוך בפיתוח שלו: https://paypal.me/orenasher
