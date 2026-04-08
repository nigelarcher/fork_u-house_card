# Fork U-House Card

## REQUIRED: 
1. Add `season.season` in integrations.
2. Add `sun.sun` sensor in integrations.
3. Using Google's API, add UV index and pollen sensors (google for this, it's free anyway).
4. You will need also from Google AQI sensors ;)
5. Add Google Weather or OpenWeatherMap integration - both are free (even if asked to add credit card for OpenWeatherAPI - just use a virtual card like Revolut and close it after).
   *If you have an old OpenWeatherMap API added before 2025 it may not report additional attributes (don't know if I'm right but had this issue).*
   
**NOTE:** Wind direction sensor is mandatory for cloud animation direction movement!

I know it's a lot, but if you don't use them then you did not unlock secret items. The journey will start now ;)

![msedge_bNu5APEUJq](https://github.com/user-attachments/assets/8405dc20-4e71-4588-a56a-044292b8ab87)

An advanced, glassmorphism-styled Home Assistant Lovelace card designed for monitoring home climate, weather conditions, and environmental hazards.

**Temperature monitoring, smart AI weather advice, and immersive visual effects.**

"Fork U" means I DON'T FCKING CARE, you have to mod this card as you need. (Weather effects based on Prism).

## Features

* **AI Smart Advisor:** A "storyteller" logic that analyzes forecast, wind, UV, AQI, and pollen data to provide human-readable, contextual advice (e.g., *"Wind Chill Warning: It's 5 degrees but feels like -2 due to strong winds"*).
* **Prism Weather Engine:**
    * **Rain/Snow:** Elegant, non-intrusive particle animations (Prism Classic style).
    * **Stars:** Automatically appear at night when the sky is clear.
    * **Fog:** Organic fog puffs appear during foggy weather or rainy nights.
    * **Clouds:** Dynamic cloud density based on the `cloud_coverage` entity.
    * **Wind Physics:** Clouds and rain/snow change direction and speed based on real wind sensor data.
* **Day/Night Cycle:** The house image dims automatically at night to match your dashboard's theme.
* **Gaming Ambient Mode:** A toggleable immersive mode that overlays soft, floating ambient lights (Magenta/Cyan/Purple) over the house image.
* **Room Badges:** Positionable badges for rooms/sensors overlaid on your house image. Supports custom units and colour thresholds.
* **Themed Days:** Automatic themed images for holidays (Christmas, Easter, Halloween, ANZAC Day, AFL Grand Final, Melbourne Cup, and more).
* **Christmas Calendar:** Unique daily scenes for Dec 1-26, alternating traditional/Australian style.
* **Multi-language:** Built-in support for **English** and **Polish** (configurable).

## Installation

### Option 1: HACS (Recommended)

1.  Open **HACS** in Home Assistant.
2.  Go to **Frontend** > **Custom repositories** (top right menu).
3.  Add the URL of this repository.
4.  Select category: **Lovelace**.
5.  Click **Add** and then **Download**.
6.  Reload your resources/browser.

### Option 2: Manual

1.  Download `fork_u-house_card.js` from the latest release.
2.  Upload it to your Home Assistant `config/www/` directory.
3.  Add the resource in your Dashboard configuration:
    * URL: `/local/fork_u-house_card.js`
    * Type: `JavaScript Module`

## Setting Up Images

### Why a separate folder?

HACS only manages the JS file. If you put images inside the HACS-managed folder (`config/www/community/fork_u-house_card/`), they will be **deleted on every HACS update**.

### Recommended: Use a separate images folder

1. Create a folder outside HACS control:
   ```
   config/www/house_card_images/
   ```

2. Copy all your generated `.png` files into it:
   ```
   config/www/house_card_images/
   ├── summer_day.png
   ├── summer_night.png
   ├── winter_rainy_day.png
   ├── themed_easter_day.png
   ├── xmas_dec25_night.png
   ├── gaming_synthwave.png
   └── ...
   ```

3. Set `image_path` in your dashboard YAML to point to this folder:
   ```yaml
   image_path: /local/house_card_images/
   ```

This folder is served by HA at `/local/house_card_images/` and will **never be touched by HACS updates**.

### Quick copy via SSH/terminal

If you already have images in the HACS folder, move them out:
```bash
mkdir -p /config/www/house_card_images
cp /config/www/community/fork_u-house_card/images/* /config/www/house_card_images/
```

## Configuration

Add the following to your Dashboard YAML configuration.

```yaml
type: custom:fork-u-house-card
language: "en"        # Options: 'en', 'pl'
image_path: /local/house_card_images/

# --- Core Entities (Required) ---
weather_entity: weather.forecast_home
season_entity: sensor.season
sun_entity: sun.sun
cloud_coverage_entity: sensor.openweathermap_cloud_coverage  # Optional (0-100%)

# --- Gaming Mode ---
party_mode_entity: input_boolean.gaming_mode
gaming_image: synthwave  # Options: synthwave, cyberpunk, matrix, mario, xbox_kid

# --- Temperature Thresholds ---
# Global defaults for badge colour coding: [cold, optimal, warm, hot]
# temp_thresholds: [18, 24, 30, 35]

# --- Birthdays (MM-DD format) ---
birthdays:
  - name: boy_bday
    date: "03-15"
  - name: girl_bday
    date: "12-23"

# --- Weather Image Overrides ---
# Set to true to enable weather-specific images for a season/time combo
# img_winter_snowy_day: true
# img_summer_rainy_night: true

# --- Test Mode ---
# Override weather state for testing animations:
# test_weather_state: fog  # lightning, snowy, rainy, etc.

# --- Environmental Sensors (for AI advisor) ---
aqi_entity: sensor.waqi_pm2_5
pollen_entity: sensor.pollen_level
uv_entity: sensor.uv_index
wind_speed_entity: sensor.wind_speed
wind_direction_entity: sensor.wind_bearing

# --- Rooms ---
rooms:
  # Basic temperature sensor (uses default temp colour thresholds)
  - name: "Living Room"
    entity: sensor.living_room_temperature
    x: 50
    y: 70
    weight: 1

  # Custom unit with custom colour thresholds
  - name: "Humidity"
    entity: sensor.lounge_humidity
    unit: "%"
    x: 60
    y: 45
    weight: 0  # excluded from median temp
    thresholds: [30, 50, 70]
    colors: ["#F87171", "#34D399", "#FBBF24", "#F87171"]
    # <30% red (dry), 30-50% green, 50-70% amber, >70% red (humid)

  # Fermenter with tight brewing range
  - name: "Fermenter"
    entity: sensor.fermenter_temp
    x: 50
    y: 50
    weight: 1
    thresholds: [16, 20, 24]
    colors: ["#60A5FA", "#34D399", "#FBBF24", "#F87171"]

  # Sensor with no colour coding
  - name: "Solar"
    entity: sensor.solar_power
    unit: "W"
    x: 70
    y: 50
    weight: 0
```

### Room badge options

| Option | Default | Description |
|---|---|---|
| `name` | required | Display name |
| `entity` | required | HA entity ID |
| `x`, `y` | `50` | Position as % (0-100) |
| `weight` | `1` | `1` = include in median temp, `0` = exclude |
| `unit` | `°` | Display unit. Default uses temp colour coding |
| `thresholds` | - | Array of 3 values defining 4 colour zones |
| `colors` | - | Array of 4 hex colours matching the zones |

## Themed Days Calendar

The card automatically shows themed images on special dates. No configuration needed (except birthdays).

| Date | Theme | Image prefix |
|---|---|---|
| Dec 31 - Jan 1 | New Years | `themed_new_years_` |
| Jan 26 | Australia Day | `themed_australia_day_` |
| Jan 27-31 | Back to School | `themed_back_to_school_` |
| Jan 20 - Feb 12 | Lunar New Year | `themed_lunar_new_year_` |
| Feb 14 | Valentine's Day | `themed_valentines_day_` |
| Mar 17 | St Patrick's Day | `themed_st_patricks_day_` |
| Last Sun Mar | Neighbour Day | `themed_neighbour_day_` |
| Good Fri - Easter Mon | Easter | `themed_easter_` |
| Apr 25 | ANZAC Day | `themed_anzac_day_` |
| 2nd Sun May | Mother's Day | `themed_mothers_day_` |
| Jun 5 | Environment Day | `themed_environment_day_` |
| Jun/Jul (Wed nights) | State of Origin | `themed_state_of_origin_` |
| Sep 8 | Wedding Anniversary | `themed_wedding_anniversary_` |
| 1st Sun Sep | Father's Day | `themed_fathers_day_` |
| Last Sat Sep | AFL Grand Final | `themed_afl_grand_final_` |
| Oct 25-31 | Halloween | `halloween_` |
| 1st Tue Nov | Melbourne Cup | `themed_melbourne_cup_` |
| Dec 1-26 | Christmas Calendar | `xmas_dec{day}_` |
| Configured dates | Birthdays | `themed_{name}_{season}_` |

All themed images need `day.png` and `night.png` suffixes (e.g. `themed_easter_day.png`, `themed_easter_night.png`).

Birthday images use all-season variants: `themed_boy_bday_summer_day.png`, `themed_boy_bday_winter_night.png`, etc.

## Image Generation

### AI Asset Generator (Recommended)

Generate all required house assets for free using Google Colab and the Gemini API.

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/silasmariusz/fork_u-house_card/blob/main/colab_generator/generate_house_assets.ipynb)

**Steps:**
1. Click the **Open in Colab** button above.
2. Get a free API Key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Upload photos of your house when prompted (or upload an existing master reference).
4. Run the notebook (select `gemini-2.5-flash-image` for **Free Tier** generation).
5. Download the zip and extract to your `config/www/house_card_images/` folder.

### Required Output Files

| Category | Count | Examples |
|---|---|---|
| Base (season/time) | 8 | `winter_day.png`, `summer_night.png` |
| Weather variants | 40+ | `winter_rainy_day.png`, `summer_fog_night.png` |
| Xmas fallback | 4 | `xmas_day.png`, `xmas_australian_day.png` |
| Xmas calendar | 52 | `xmas_dec1_day.png` ... `xmas_dec26_night.png` |
| Halloween | 2 | `halloween_day.png`, `halloween_night.png` |
| Gaming modes | 5 | `gaming_synthwave.png`, `gaming_cyberpunk.png` |
| Themed days | 24+ | `themed_easter_day.png`, `themed_anzac_day_night.png` |
| Birthdays | 16 | `themed_boy_bday_summer_day.png` (4 seasons x day/night) |

### Local Generation (Advanced)

For automated generation using **Gemini 3 Pro** locally, use the `image_generation/` folder and the `generate_house_images.py` script.

1. **Reference Images** -- Place photos of your house in `image_generation/reference/`.
2. **Master** -- Generate the master reference image and save as `_master_reference.png`.
3. **Variants** -- Run `python generate_house_images.py` or use `--export-prompts`.
4. **Results** -- Copy output to your `config/www/house_card_images/` folder.

---

# AI ASSET GENERATOR
> [!TIP]
> 
> You don't need to manually create 100+ images! 
> We have created a **Free AI Tool** that generates all weather, season, themed day, and Christmas calendar variants for you.
> 
> [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/silasmariusz/fork_u-house_card/blob/main/colab_generator/generate_house_assets.ipynb) <br> *(Click above to start generating for free!)*
>
> Howto:
> ![ezgif-84e148d15543d035](https://github.com/user-attachments/assets/97116b93-1bc0-44ff-9ddd-b01cb8389c41)
>
> Result:
> <img width="1344" height="768" alt="winter_lightning_day" src="https://github.com/user-attachments/assets/26b3a9fa-f3ad-48c3-9ec6-ea43631a1614" />
>
> Source data (google maps, and streatview)
> <img width="646" height="349" alt="roof" src="https://github.com/user-attachments/assets/5029ba36-28d9-4630-8d0a-cd20161ad65e" />
![optional](https://github.com/user-attachments/assets/c6e87b26-6a0a-4e23-b5ea-b67d547e5c3e)
![ang3](https://github.com/user-attachments/assets/ccdf5ff7-f45f-4761-a081-9e5d279f9381)
![ang2](https://github.com/user-attachments/assets/02c2b669-5126-41c8-9b81-3aa998973e4f)
![ang1](https://github.com/user-attachments/assets/30630e89-f732-4a04-8e5a-631dcc8be960)
